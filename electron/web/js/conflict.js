'use strict';

/* ============================================================
   Conflict Resolution — ตรวจจับและแก้ไขข้อมูลขัดแย้ง
   เมื่อมีการแก้ไขจากหลายเครื่องพร้อมกัน
   ============================================================ */

const ConflictResolver = {

  /* ============================================================
     ขั้นตอนที่ 1: ตรวจจับ conflict
     ============================================================ */

  /**
   * ตรวจจับ conflict ระหว่าง local changes กับ remote data
   * @param {Object} remoteData - ข้อมูลใหม่จาก Firebase
   * @returns {Object|null} - conflicts ที่พบ หรือ null ถ้าไม่มี
   */
  detectConflicts(remoteData) {
    if (!remoteData || !remoteData.items) return null;

    const localChanges = Store._getLocalChangesSinceSync();
    const base = Store._lastSyncedDb || Store._loadSyncBase();

    /* ถ้าไม่มี base = ครั้งแรกที่ sync → ไม่มี conflict */
    if (!base) return { hasConflict: false, canAutoMerge: true, conflicts: [] };

    const conflicts = [];
    const autoMergeable = [];

    /* --- ตรวจจับ conflict ของ items --- */
    const remoteItemMap = {};
    (remoteData.items || []).forEach(i => { remoteItemMap[i.id] = i; });

    Object.entries(localChanges.items || {}).forEach(([id, change]) => {
      const remote = remoteItemMap[id];

      if (change.type === 'add') {
        /* Local เพิ่มใหม่ → ตรวจสอบว่า Remote ก็เพิ่มใหม่เหมือนกันไหม */
        if (remote) {
          /* ทั้งคู่เพิ่ม item ตัวเดียวกัน → conflict */
          const diffs = Store._fieldDiffs(change.local, remote, ['id', 'updatedAt', 'updatedBy']);
          if (diffs.length > 0) {
            conflicts.push({
              type: 'item',
              id,
              changeType: 'both_add',
              local: change.local,
              remote,
              base: null,
              diffs,
              itemName: change.local.name || remote.name || id,
            });
          } else {
            /* เพิ่มเหมือนกัน ไม่ conflict */
            autoMergeable.push({ type: 'item', id, action: 'keep_both' });
          }
        } else {
          /* Local เพิ่มใหม่ แต่ Remote ไม่มี → safe to push */
          autoMergeable.push({ type: 'item', id, action: 'local_only' });
        }
      } else if (change.type === 'update') {
        if (!remote) {
          /* Local แก้ไข แต่ Remote ลบ → conflict */
          conflicts.push({
            type: 'item',
            id,
            changeType: 'local_update_remote_delete',
            local: change.local,
            remote: null,
            base: change.base,
            diffs: change.diffs,
            itemName: change.local.name || id,
          });
        } else {
          /* ทั้งคู่แก้ไข → เปรียบเทียบ field */
          const remoteDiffs = Store._fieldDiffs(base[id] || {}, remote, ['id', 'updatedAt', 'updatedBy']);
          const localDiffs = change.diffs;
          const conflictFields = this._findConflictingFields(localDiffs, remoteDiffs);

          if (conflictFields.length > 0) {
            /* มี field ที่ทั้งคู่แก้ไข → conflict */
            conflicts.push({
              type: 'item',
              id,
              changeType: 'both_update',
              local: change.local,
              remote,
              base: change.base,
              localDiffs,
              remoteDiffs,
              conflictFields,
              itemName: change.local.name || remote.name || id,
            });
          } else {
            /* แก้ไขคนละ field → auto merge */
            autoMergeable.push({
              type: 'item', id, action: 'auto_merge',
              local: change.local, remote, base: change.base,
              localDiffs, remoteDiffs,
            });
          }
        }
      } else if (change.type === 'delete') {
        if (remote && (remote.updatedAt || 0) > (change.base.updatedAt || 0)) {
          /* Local ลบ แต่ Remote แก้ไข → conflict */
          conflicts.push({
            type: 'item',
            id,
            changeType: 'local_delete_remote_update',
            local: null,
            remote,
            base: change.base,
            itemName: remote.name || id,
          });
        } else if (!remote) {
          /* ทั้งคู่ลบ → ไม่ conflict */
          autoMergeable.push({ type: 'item', id, action: 'both_delete' });
        }
      }
    });

    /* ตรวจ transactions ที่ Remote เพิ่มใหม่ */
    const remoteTxIds = new Set((remoteData.transactions || []).map(t => t.id));
    const localTxIds = new Set((Store.db.transactions || []).map(t => t.id));
    (remoteData.transactions || []).forEach(tx => {
      if (!localTxIds.has(tx.id)) {
        autoMergeable.push({ type: 'transaction', id: tx.id, action: 'remote_add', remote: tx });
      }
    });

    return {
      hasConflict: conflicts.length > 0,
      canAutoMerge: conflicts.length === 0,
      conflicts,
      autoMergeable,
      remoteData,
      localChanges,
    };
  },

  /* ค้นหา field ที่ทั้ง local และ remote แก้ไขเหมือนกัน */
  _findConflictingFields(localDiffs, remoteDiffs) {
    const remoteFieldSet = new Set(remoteDiffs.map(d => d.field));
    return localDiffs.filter(d => {
      if (!remoteFieldSet.has(d.field)) return false;
      const rDiff = remoteDiffs.find(r => r.field === d.field);
      if (!rDiff) return false;
      /* localVal = ค่าใหม่ของฝั่งนั้น (local/remote), baseVal = ค่าเดิม */
      /* เปรียบเทียบ ค่าใหม่ของ local กับ ค่าใหม่ของ remote */
      return JSON.stringify(d.localVal) !== JSON.stringify(rDiff.localVal);
    }).map(d => d.field);
  },

  /* ============================================================
     ขั้นตอนที่ 2: Auto Merge (ไม่มี conflict ใน field เดียวกัน)
     ============================================================ */

  autoMerge(result) {
    if (!result || !result.autoMergeable) return;

    result.autoMergeable.forEach(entry => {
      if (entry.type === 'transaction' && entry.action === 'remote_add') {
        /* เพิ่ม transaction ที่ Remote เพิ่มเข้ามา */
        const exists = Store.db.transactions.find(t => t.id === entry.remote.id);
        if (!exists) Store.db.transactions.push(entry.remote);
      }
      if (entry.type === 'item' && entry.action === 'auto_merge') {
        /* รวม field จาก remote (ใช้ค่า baseVal ของ diff = ค่าที่ remote เปลี่ยนเป็น) */
        const item = Store.getItem(entry.id);
        if (item && entry.remote) {
          entry.remoteDiffs.forEach(d => {
            item[d.field] = entry.remote[d.field];
          });
        }
      }
      if (entry.type === 'item' && entry.action === 'remote_only') {
        /* Remote เพิ่มใหม่ → เพิ่มลง local */
        const exists = Store.getItem(entry.id);
        if (!exists) Store.db.items.push(entry.remote);
      }
    });

    Store.save();
  },

  /* ============================================================
     ขั้นตอนที่ 3: Manual Resolution (แสดง Modal)
     ============================================================ */

  /**
   * สร้าง HTML สำหรับ conflict resolution modal
   */
  renderConflictModal(result) {
    if (!result || !result.conflicts || result.conflicts.length === 0) return '';

    const conflictRows = result.conflicts.map((c, idx) => {
      return this._renderSingleConflict(c, idx);
    }).join('');

    return `
      <div class="conflict-modal">
        <div class="conflict-banner">
          ${icon('alert', 28)}
          <div>
            <strong>ตรวจพบข้อมูลขัดแย้ง ${result.conflicts.length} รายการ</strong>
            <p class="muted small">มีการแก้ไขข้อมูลเดียวกันจากเครื่องอื่นพร้อมกัน กรุณาเลือกว่าจะใช้ข้อมูลใด</p>
          </div>
        </div>

        ${result.autoMergeable.length > 0 ? `
          <div class="conflict-autosave-info">
            ${icon('check', 16)}
            <span>จะผสานข้อมูลอัตโนมัติ ${result.autoMergeable.length} รายการ (แก้ไขคนละส่วน ไม่ขัดแย้ง)</span>
          </div>
        ` : ''}

        <div class="conflict-list" id="conflict-list">
          ${conflictRows}
        </div>

        <div class="conflict-actions">
          <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก (ใช้ข้อมูลเครื่องนี้ต่อ)</button>
          <button class="btn btn-primary" onclick="ConflictResolver.applyAllResolutions()">
            ${icon('check', 16)} ยืนยันและบันทึก
          </button>
        </div>
      </div>
    `;
  },

  _renderSingleConflict(conflict, idx) {
    const fieldTypeLabels = {
      name: 'ชื่อวัสดุ', code: 'รหัสวัสดุ', category: 'หมวดหมู่',
      unit: 'หน่วย', minStock: 'จำนวนขั้นต่ำ', location: 'สถานที่จัดเก็บ',
      note: 'หมายเหตุ', group: 'กลุ่มงาน', mission: 'ภารกิจ',
      workUnit: 'งาน', image: 'รูปภาพ',
    };

    let detailsHtml = '';

    if (conflict.changeType === 'both_update') {
      const fieldRows = conflict.conflictFields.map(f => {
        const localVal = this._getFieldDisplayValue(conflict.local, f);
        const remoteVal = this._getFieldDisplayValue(conflict.remote, f);
        const label = fieldTypeLabels[f] || f;
        return `
          <div class="conflict-field-row">
            <div class="conflict-field-name">${esc(label)}</div>
            <div class="conflict-field-options">
              <label class="conflict-radio">
                <input type="radio" name="cfl_${idx}_${f}" value="local" checked>
                <span class="conflict-val local">${esc(String(localVal || '(ว่าง)'))}</span>
                <span class="conflict-source">เครื่องนี้</span>
              </label>
              <label class="conflict-radio">
                <input type="radio" name="cfl_${idx}_${f}" value="remote">
                <span class="conflict-val remote">${esc(String(remoteVal || '(ว่าง)'))}</span>
                <span class="conflict-source">เครื่องอื่น</span>
              </label>
            </div>
          </div>
        `;
      }).join('');

      detailsHtml = `
        <p class="conflict-detail-text">แก้ไขข้อมูล <strong>${esc(conflict.itemName)}</strong> ทั้งสองเครื่อง</p>
        <div class="conflict-fields">${fieldRows}</div>
      `;
    } else if (conflict.changeType === 'both_add') {
      detailsHtml = `
        <p class="conflict-detail-text">ทั้งสองเครื่องเพิ่มวัสดุ "<strong>${esc(conflict.itemName)}</strong>" พร้อมกัน</p>
        <div class="conflict-fields">
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="local" checked>
            <span>ใช้ข้อมูลจากเครื่องนี้</span>
            <span class="conflict-source">${esc(conflict.local?.code || '')}</span>
          </label>
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="remote">
            <span>ใช้ข้อมูลจากเครื่องอื่น</span>
            <span class="conflict-source">${esc(conflict.remote?.code || '')}</span>
          </label>
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="both">
            <span>เก็บทั้งคู่ (จะได้ 2 รายการ)</span>
          </label>
        </div>
      `;
    } else if (conflict.changeType === 'local_update_remote_delete') {
      detailsHtml = `
        <p class="conflict-detail-text">เครื่องนี้แก้ไข "<strong>${esc(conflict.itemName)}</strong>" แต่เครื่องอื่นลบออกไปแล้ว</p>
        <div class="conflict-fields">
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="local" checked>
            <span>เก็บไว้ (ใช้ข้อมูลเครื่องนี้)</span>
          </label>
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="delete">
            <span>ลบออก (ทำตามเครื่องอื่น)</span>
          </label>
        </div>
      `;
    } else if (conflict.changeType === 'local_delete_remote_update') {
      detailsHtml = `
        <p class="conflict-detail-text">เครื่องนี้ลบ "<strong>${esc(conflict.itemName)}</strong>" แต่เครื่องอื่นแก้ไขข้อมูล</p>
        <div class="conflict-fields">
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="remote" checked>
            <span>กู้คืน (ใช้ข้อมูลเครื่องอื่น)</span>
          </label>
          <label class="conflict-radio wide">
            <input type="radio" name="cfl_${idx}_action" value="delete">
            <span>ยืนยันลบ</span>
          </label>
        </div>
      `;
    }

    return `
      <div class="conflict-item" data-idx="${idx}" data-type="${conflict.type}">
        <div class="conflict-item-header">
          <span class="conflict-badge">${conflict.changeType === 'both_add' ? '➕ ซ้ำ' : conflict.changeType.includes('delete') ? '🗑️ ลบ' : '✏️ แก้ไข'}</span>
          <span class="conflict-item-id">#${idx + 1}</span>
        </div>
        ${detailsHtml}
      </div>
    `;
  },

  _getFieldDisplayValue(obj, field) {
    if (!obj) return '';
    return obj[field] ?? '';
  },

  /* ============================================================
     ขั้นตอนที่ 4: บันทึกผลลัพธ์ (after user resolves)
     ============================================================ */

  /**
   * อ่านค่าจาก modal และ apply ลง Store.db
   */
  applyAllResolutions() {
    const conflictList = document.getElementById('conflict-list');
    if (!conflictList) return;

    const items = conflictList.querySelectorAll('.conflict-item');
    const result = window.__currentConflictResult;
    if (!result) return;

    items.forEach((el) => {
      const idx = parseInt(el.dataset.idx, 10);
      const conflict = result.conflicts[idx];
      if (!conflict) return;

      if (conflict.changeType === 'both_update') {
        /* แก้ไขทั้งคู่ — เลือก field ทีละ field */
        conflict.conflictFields.forEach(f => {
          const selected = el.querySelector(`input[name="cfl_${idx}_${f}"]:checked`);
          if (!selected) return;
          const val = selected.value === 'local' ? conflict.local[f] : conflict.remote[f];
          if (conflict.local) conflict.local[f] = val;
        });
        /* เขียน local version ลง Store */
        const existing = Store.getItem(conflict.id);
        if (existing && conflict.local) {
          Object.assign(existing, conflict.local);
          Store._stamp(existing);
        }
      } else if (conflict.changeType === 'both_add') {
        const action = el.querySelector(`input[name="cfl_${idx}_action"]:checked`);
        const val = action ? action.value : 'local';
        if (val === 'remote') {
          /* ใช้ remote → แทนที่ local */
          const existingIdx = Store.db.items.findIndex(i => i.id === conflict.id);
          if (existingIdx >= 0) {
            Store.db.items[existingIdx] = conflict.remote;
          } else {
            Store.db.items.push(conflict.remote);
          }
        } else if (val === 'both') {
          /* เก็บทั้งคู่ → แก้ id ของ remote ให้ซ้ำ */
          const remoteCopy = JSON.parse(JSON.stringify(conflict.remote));
          remoteCopy.id = uid('it');
          remoteCopy.code = Store.nextItemCode();
          remoteCopy.name = conflict.remote.name + ' (สำเนา)';
          Store._stamp(remoteCopy);
          Store.db.items.push(remoteCopy);
        }
        /* val === 'local' → ไม่ต้องทำอะไร ใช้ข้อมูลเดิม */
      } else if (conflict.changeType === 'local_update_remote_delete') {
        const action = el.querySelector(`input[name="cfl_${idx}_action"]:checked`);
        const val = action ? action.value : 'local';
        if (val === 'delete') {
          Store.db.items = Store.db.items.filter(i => i.id !== conflict.id);
        }
        /* val === 'local' → ไม่ต้องทำอะไร ข้อมูลยังอยู่ */
      } else if (conflict.changeType === 'local_delete_remote_update') {
        const action = el.querySelector(`input[name="cfl_${idx}_action"]:checked`);
        const val = action ? action.value : 'remote';
        if (val === 'remote') {
          /* กู้คืนจาก remote */
          const exists = Store.getItem(conflict.id);
          if (!exists) {
            Store.db.items.push(conflict.remote);
          } else {
            Object.assign(exists, conflict.remote);
          }
        }
        /* val === 'delete' → ข้อมูลถูกลบไปแล้ว ไม่ต้องทำอะไร */
      }
    });

    /* ผสาน auto-merge */
    this.autoMerge(result);

    closeModal();
    window.__currentConflictResult = null;
    toast('แก้ไขข้อมูลขัดแย้งเรียบร้อย', 'success');

    /* บันทึก sync base ใหม่ */
    Store._saveSyncBase();

    /* บันทึกขึ้น Firebase */
    if (typeof autoSyncToFirebase === 'function') {
      autoSyncToFirebase().then(() => {
        route();
      });
    } else {
      route();
    }
  },
};
