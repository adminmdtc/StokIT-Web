'use strict';

/* ============================================================
   LiveSync — อัปเดตหน้าจอสดเมื่อผู้ใช้อื่นบันทึกข้อมูล
   ทำงานเมื่อเปิดโหมด Supabase: ติดตาม Realtime stream แล้ว
   1) ดึงข้อมูลล่าสุดจากคลาวด์ (debounce รวมเหตุการณ์ที่ติดกัน)
   2) วาดหน้าจอใหม่ — ข้ามถ้ากำลังเปิด modal/ฟอร์ม เพื่อไม่ทับสิ่งที่พิมพ์ค้าง
   3) โชว์แถบแจ้งเตือนสั้น ๆ และไอคอนสถานะ "สด" ที่หัวเว็บ
   ============================================================ */

const LiveSync = {
  _timer: null,
  _lastApplied: 0,
  _badge: null,
  _seenRev: 0, /* rev ล่าสุดที่เครื่องนี้รับแล้ว — rev ใหม่กว่านี้ = มีการกู้คืน backup ต้อง replace เต็ม */
  _pollTimer: null,
  _blurHandler: null,

  isLive() {
    return typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled;
  },

  start() {
    if (!this.isLive()) return;
    SupabaseBackend.startRealtime((evt) => this._onRemoteChange(evt));
    /* polling สำรองทุก 45 วิ — กัน websocket/เน็ตมีปัญหา เครื่องอื่นจะได้ข้อมูลใหม่ไม่เกินหนึ่งนาที */
    if (!this._pollTimer) this._pollTimer = setInterval(() => this._onRemoteChange({ source: 'poll' }), 45000);
    /* เลิกพิมพ์เมื่อไหร่ ถ้าไม่มีข้อมูลค้างจริงแล้ว ค่อยวาดหน้าใหม่ทันที */
    if (!this._blurHandler) {
      this._blurHandler = () => setTimeout(() => {
        if (this._pendingWhileEditing && !this._isUserTyping()) {
          this._pendingWhileEditing = false;
          this._applyRemote();
        }
      }, 300);
      document.addEventListener('focusout', this._blurHandler);
    }
    this._setStatus('connected', 'ซิงค์สด (Supabase)');
    this._ensureBadge();
  },

  stop() {
    if (typeof SupabaseBackend !== 'undefined') SupabaseBackend.stopRealtime();
    if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._blurHandler) { document.removeEventListener('focusout', this._blurHandler); this._blurHandler = null; }
    this._setStatus('offline', 'ไม่ได้ซิงค์');
    this._removeBadge();
  },

  /* อัปเดตแถบสถานะซิงค์ที่แถบข้าง (ถ้ามี) */
  _setStatus(status, msg) {
    try { if (typeof updateSyncIndicator === 'function') updateSyncIndicator(status, msg); } catch (e) { /* ignore */ }
  },

  /* ---- จุดเริ่มเมื่อ remote มีการเปลี่ยนแปลง ---- */
  _onRemoteChange(evt) {
    /* debounce: เหตุการณ์ติดกันภายใน 1.2 วิ = ดึงครั้งเดียว */
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._applyRemote(), 1200);
  },

  async _applyRemote() {
    if (!this.isLive()) return;
    try {
      const data = await SupabaseBackend.pullAll();
      const hasAny = (data.items && data.items.length) || (data.transactions && data.transactions.length);
      if (!hasAny) return;

      /* กัน race: ถ้าระหว่าง fetch นี้เครื่องเราเพิ่งเพิ่ม/แก้ข้อมูล (push ขึ้นคลาวด์แล้ว)
         อย่าเขียนทับรายการที่ยังไม่มีใน snapshot ที่ได้มา — merge แทน
         ยกเว้น: rev เปลี่ยน (มีใครกู้คืน backup) = replace เต็มเสมอ */
      const revChanged = data.rev !== undefined && data.rev !== this._seenRev && this._seenRev !== 0;
      const firstSeen = this._seenRev === 0;
      if (data.rev !== undefined) this._seenRev = data.rev;

      let localNewItems = [];
      let localNewTxs = [];
      if (!revChanged && !firstSeen) {
        localNewItems = (Store.db.items || []).filter(li => !data.items.some(ci => ci.id === li.id));
        localNewTxs = (Store.db.transactions || []).filter(lt => !(data.transactions || []).some(ct => ct.id === lt.id));
      }

      Store.db.items = data.items.concat(localNewItems);
      Store.db.transactions = (data.transactions || []).map(t => ({ ...t, items: typeof t.items === 'string' ? JSON.parse(t.items) : t.items })).concat(localNewTxs);
      if (data.users && data.users.length) Store.db.users = data.users;
      if (data.reorderItems && data.reorderItems.length) Store.db.reorderItems = data.reorderItems;
      if (data.seq && data.seq.item) Store.db.seq = Object.assign({}, Store.db.seq, data.seq);
      Store.db._lastSync = Date.now();
      try { localStorage.setItem('it_stock_db_v5', JSON.stringify(Store.db)); } catch (e) { /* ignore */ }
      this._lastApplied = Date.now();

      /* ส่งรายการที่เพิ่งเพิ่มในเครื่องขึ้นคลาวด์ให้ทัน (ถ้ายังไม่ขึ้น) */
      if (localNewItems.length) {
        for (const it of localNewItems) { try { await SupabaseBackend.addItem(it); } catch (e) { /* retry รอบหน้า */ } }
      }
      if (localNewTxs.length) {
        for (const tx of localNewTxs) { try { await SupabaseBackend.addTransaction(tx); } catch (e) { /* retry รอบหน้า */ } }
      }

      /* วาดหน้าใหม่เฉพาะเมื่อผู้ใช้ไม่ได้กรอกข้อมูลค้างไว้ (กันฟอร์มหาย) */
      if (this._isUserTyping()) {
        this._pendingWhileEditing = true;
        this.notify('มีข้อมูลใหม่จากผู้ใช้อื่น — จะอัปเดตหลังบันทึก/ปิดฟอร์ม');
        return;
      }
      if (typeof route === 'function') route();
      this.notify('อัปเดตข้อมูลสดจากคลาวด์แล้ว ✅');
      this._setStatus('connected', 'ซิงค์สด (Supabase)');
    } catch (e) {
      this._setStatus('error', 'ซิงค์ผิดพลาด — จะลองใหม่');
      console.error('LiveSync apply error:', e);
    }
  },

  /* ตรวจว่าผู้ใช้กำลังกรอกข้อมูลอยู่หรือไม่ — จริง ๆ ทั้งหน้า ไม่ใช่แค่ modal */
  _isUserTyping() {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      /* ช่องค้นหา/ตัวกรองที่ว่างเปล่าไม่ถือว่ากำลังกรอกข้อมูลสำคัญ */
      const ph = (active.getAttribute('placeholder') || '') + (active.id || '') + (active.name || '');
      const isSearch = /search|ค้น|filter|q$/i.test(ph) && !(active.value || '').trim();
      if (!isSearch) return true;
    }
    /* แถวรายการรับ/จำหน่ายที่มีข้อมูลกรอกค้าง = ห้ามวาดใหม่ (แถวเปล่าไม่นับ) */
    let txHasData = false;
    document.querySelectorAll('.tx-row').forEach(r => {
      r.querySelectorAll('input, select, textarea').forEach(el => {
        if (String(el.value || '').trim()) txHasData = true;
      });
    });
    if (txHasData) return true;
    /* modal เปิดอยู่และมีช่องกรอก = ห้ามวาดใหม่ */
    const modalOpen = document.querySelector('.modal-overlay');
    if (modalOpen && modalOpen.querySelector('input, textarea, select')) return true;
    return false;
  },

  /* เรียกเมื่อปิด modal — ถ้ามีข้อมูลค้างรอ ให้วาดทันที */
  onModalClosed() {
    if (this._lastApplied && this._pendingWhileEditing) {
      this._pendingWhileEditing = false;
      this._applyRemote();
    }
  },

  /* ---- ไอคอนสถานะ "สด" ที่หัวเว็บ ---- */
  _ensureBadge() {
    if (this._badge && document.body.contains(this._badge)) return;
    const chip = document.getElementById('today-chip');
    if (!chip || !chip.parentElement) return;
    const b = document.createElement('span');
    b.id = 'livesync-badge';
    b.title = 'เชื่อมต่อ Supabase Realtime — ข้อมูลอัปเดตสด';
    b.style.cssText = 'display:inline-flex;align-items:center;gap:5px;margin-left:8px;padding:2px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:600;cursor:default;';
    b.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;animation:pulse-dot 1.6s infinite"></span>สด';
    chip.parentElement.insertBefore(b, chip.nextSibling);
    this._badge = b;
    const st = document.createElement('style');
    st.textContent = '@keyframes pulse-dot{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}';
    document.head.appendChild(st);
  },

  _removeBadge() {
    if (this._badge && this._badge.parentElement) this._badge.parentElement.removeChild(this._badge);
    this._badge = null;
  },

  /* ---- แถบแจ้งเตือนสั้น ๆ มุมจอ ---- */
  notify(msg) {
    let bar = document.getElementById('livesync-toast');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'livesync-toast';
      bar.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:9999;background:#065f46;color:#fff;padding:10px 16px;border-radius:10px;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:0;transform:translateY(8px);transition:all .25s;';
      document.body.appendChild(bar);
    }
    bar.textContent = '☁️ ' + msg;
    requestAnimationFrame(() => { bar.style.opacity = '1'; bar.style.transform = 'translateY(0)'; });
    clearTimeout(this._nt);
    this._nt = setTimeout(() => { bar.style.opacity = '0'; bar.style.transform = 'translateY(8px)'; }, 3500);
  },
};

/* ถ้าเปิดโหมด Supabase ตอนโหลดหน้า → เริ่มเลย */
window.addEventListener('DOMContentLoaded', () => { if (LiveSync.isLive()) LiveSync.start(); });
