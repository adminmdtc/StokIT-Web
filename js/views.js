'use strict';

/* ============================================================
   Views — เรนเดอร์แต่ละหน้า + ตัวจัดการเหตุการณ์ (App.*)
   ============================================================ */

const isAdmin = () => (Auth.current() || {}).role === 'admin';

/* ตัวจัดการเหตุการณ์ส่วนกลาง (เรียกจาก onclick ใน HTML) */
const App = {};

/* ---------- สถานะของหน้ารายงาน ---------- */
window.REP = {
  type: 'stock',
  from: new Date().toISOString().slice(0, 7) + '-01',
  to: todayStr(),
};

function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

/* ============================================================
   หน้าหลัก (Dashboard)
   ============================================================ */
function renderDashboard() {
  const stock = Store.getStock();
  const txs = Store.transactions();
  const mKey = monthKey(new Date());
  const lowItemsAll = stock.filter(s => s.status !== 'ok');
  const lowCount = lowItemsAll.length;
  /* แจ้งเตือนวัสดุใกล้หมด (ครั้งเดียวต่อวัน) */
  if (lowCount > 0 && Telegram.isConfigured()) {
    const lastAlert = localStorage.getItem('it_stock_last_low_alert');
    const today = todayStr();
    if (lastAlert !== today) {
      localStorage.setItem('it_stock_last_low_alert', today);
      Telegram.notifyLowStock(lowItemsAll);
    }
  }
  const qtyIn = (t) => t.items.reduce((a, l) => a + l.qty, 0);
  const rcvMonth = txs.filter(t => t.type === 'receive' && t.date.slice(0, 7) === mKey).reduce((s, t) => s + qtyIn(t), 0);
  const issMonth = txs.filter(t => t.type === 'issue' && t.date.slice(0, 7) === mKey).reduce((s, t) => s + qtyIn(t), 0);

  /* แผนภูมิ 6 เดือนล่าสุด */
  const thLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = monthKey(d);
    months.push({
      key,
      label: thLabels[d.getMonth()],
      rcv: txs.filter(t => t.type === 'receive' && t.date.slice(0, 7) === key).reduce((s, t) => s + qtyIn(t), 0),
      iss: txs.filter(t => t.type === 'issue' && t.date.slice(0, 7) === key).reduce((s, t) => s + qtyIn(t), 0),
    });
  }
  const max = Math.max(1, ...months.map(m => Math.max(m.rcv, m.iss)));
  const bars = months.map(m => `
    <div class="chart-col">
      <div class="chart-pair">
        <div class="bar bar-rcv" style="height:${m.rcv ? Math.max(4, m.rcv / max * 100) : 2}%" title="รับเข้า ${m.rcv} ชิ้น"></div>
        <div class="bar bar-iss" style="height:${m.iss ? Math.max(4, m.iss / max * 100) : 2}%" title="จำหน่าย ${m.iss} ชิ้น"></div>
      </div>
      <div class="chart-label">${m.label}</div>
    </div>`).join('');

  /* วัสดุใกล้หมด (ใช้ lowItemsAll จากด้านบน) */
  const lowItems = lowItemsAll.slice(0, 6);
  const lowHtml = lowItems.length
    ? `<div class="table-wrap"><table class="list"><thead><tr><th>รายการ</th><th class="num">คงเหลือ</th><th class="num">ขั้นต่ำ</th><th>สถานะ</th></tr></thead><tbody>
        ${lowItems.map(s => `<tr class="clickable" onclick="location.hash='#/stock'">
          <td><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.code)}</div></td>
          <td class="num">${fmtQty(s.qty)} ${esc(s.unit)}</td>
          <td class="num">${fmtQty(s.minStock)}</td>
          <td>${statusBadge(s.status)}</td></tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty">${icon('check', 34)}<span>วัสดุทั้งหมดอยู่ในระดับปกติ</span></div>`;

  /* ธุรกรรมล่าสุด */
  const recent = txs.slice(0, 8);
  const recentHtml = recent.length
    ? `<div class="table-wrap"><table class="list"><thead><tr>
        <th>เลขที่</th><th>วันที่</th><th>ประเภท</th><th>ฝ่าย / คู่สัญญา</th><th>รายการ</th><th>ผู้บันทึก</th>
      </tr></thead><tbody>
        ${recent.map(t => `<tr class="clickable" onclick="location.hash='#/${t.type}'">
          <td class="td-mono">${esc(t.no)}</td>
          <td>${fmtDate(t.date)}</td>
          <td>${typeBadge(t.type)}</td>
          <td>${esc(t.party)}</td>
          <td>${esc(t.items[0].name)}${t.items.length > 1 ? ` <span class="muted small">+${t.items.length - 1} รายการ</span>` : ''}</td>
          <td class="muted">${esc(t.byName)}</td></tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty">${icon('info', 34)}<span>ยังไม่มีรายการเคลื่อนไหว</span></div>`;

  /* Banner เตือนวัสดุใกล้หมด */
  const banner = lowItemsAll.length
    ? `<div class="alert-banner">${icon('alert', 26)}
        <div><strong>มีวัสดุใกล้หมด / หมดคลัง ${lowItemsAll.length} รายการ</strong>
          <div class="small" style="opacity:.92">${lowItemsAll.slice(0, 4).map(s => esc(s.name)).join(' • ')}${lowItemsAll.length > 4 ? ` และอื่นๆ อีก ${lowItemsAll.length - 4} รายการ` : ''}</div></div>
        <div class="spacer"></div>
        <a href="#/stock" class="btn btn-light btn-sm">ไปที่หน้าคงเหลือ</a>
      </div>`
    : '';

  return `
  ${banner}
  <div class="stat-grid">
    <div class="card stat-card"><div class="icon-bubble ib-indigo">${icon('box', 22)}</div><div><div class="stat-num">${stock.length}</div><div class="stat-label">รายการวัสดุ</div></div></div>
    <div class="card stat-card"><div class="icon-bubble ib-sky">${icon('receive', 22)}</div><div><div class="stat-num">${fmtQty(rcvMonth)}</div><div class="stat-label">รับเข้าเดือนนี้ (ชิ้น)</div></div></div>
    <div class="card stat-card"><div class="icon-bubble ib-amber">${icon('issue', 22)}</div><div><div class="stat-num">${fmtQty(issMonth)}</div><div class="stat-label">จำหน่ายเดือนนี้ (ชิ้น)</div></div></div>
    <div class="card stat-card"><div class="icon-bubble ib-rose">${icon('alert', 22)}</div><div><div class="stat-num">${lowCount}</div><div class="stat-label">วัสดุใกล้หมด / หมด</div></div></div>
  </div>

  <div class="card">
    <div class="card-head"><div><h3>สรุปตามกลุ่มงาน/ภารกิจ</h3><p class="muted small">จำนวนวัสดุและยอดคงเหลือแยกตามกลุ่มงาน</p></div></div>
    <div class="table-wrap">
      <table class="list"><thead><tr>
        <th>กลุ่มงาน</th><th>ภารกิจ</th><th class="num">จำนวนรายการ</th><th class="num">จำนวนรวม (ชิ้น)</th><th>วัสดุใกล้หมด</th>
      </tr></thead><tbody>
        ${(() => {
          const groupMap = {};
          stock.forEach(s => {
            const g = s.group || '';
            const gName = g ? getGroupName(g) : 'ไม่ระบุกลุ่มงาน';
            const mId = s.group ? (MISSIONS.find(m => m.groups.some(x => x.id === s.group)) || {}).id : '';
            const mName = mId ? getMissionName(mId) : '—';
            if (!groupMap[g]) groupMap[g] = { name: gName, mission: mName, count: 0, qty: 0, low: [] };
            groupMap[g].count++;
            groupMap[g].qty += s.qty;
            if (s.status !== 'ok') groupMap[g].low.push(s.name);
          });
          return Object.values(groupMap).sort((a, b) => b.qty - a.qty).map(d =>
            `<tr>
              <td><strong>${esc(d.name)}</strong></td>
              <td class="muted small">${esc(d.mission)}</td>
              <td class="num">${d.count}</td>
              <td class="num">${fmtQty(d.qty)}</td>
              <td>${d.low.length ? `<span class="badge badge-warning">${d.low.length} รายการ</span>` : '<span class="badge badge-success">ปกติ</span>'}</td>
            </tr>`
          ).join('') || `<tr><td colspan="5"><div class="empty">${icon('info', 34)}<span>ยังไม่มีข้อมูลกลุ่มงาน</span></div></td></tr>`;
        })()}
      </tbody></table>
    </div>
  </div>

  <div class="dash-grid">
    <div class="card">
      <div class="card-head"><div><h3>สรุปการเคลื่อนไหว 6 เดือน</h3><p class="muted small">จำนวนชิ้น รับเข้าเทียบกับจำหน่าย</p></div></div>
      <div class="chart-wrap">
        <div class="chart-bars">${bars}</div>
        <div class="chart-legend"><span class="lg lg-rcv">รับเข้า</span><span class="lg lg-iss">จำหน่าย</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>วัสดุใกล้หมด / หมดคลัง</h3><p class="muted small">ต่ำกว่าจำนวนขั้นต่ำที่กำหนด</p></div>
        <a href="#/stock" class="btn btn-soft btn-sm">ดูทั้งหมด</a></div>
      ${lowHtml}
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div><h3>รายการเคลื่อนไหวล่าสุด</h3><p class="muted small">รับเข้าและจำหน่ายล่าสุด</p></div></div>
    ${recentHtml}
  </div>`;
}

/* ============================================================
   รับเข้า
   ============================================================ */
function txItemOptions(showStock) {
  const stockMap = {};
  Store.getStock().forEach(s => { stockMap[s.id] = s; });
  return Store.items().map(i => {
    const s = stockMap[i.id];
    const extra = showStock && s ? ` (คงเหลือ ${fmtQty(s.qty)} ${esc(i.unit)})` : '';
    return `<option value="${i.id}">[${esc(i.code)}] ${esc(i.name)}${extra}</option>`;
  }).join('');
}

App.addTxRow = function (type) {
  const c = type === 'receive' ? 'receive' : 'issue';
  const rows = document.getElementById(c + '-rows');
  if (!rows) return;
  const serialCol = type === 'receive'
    ? '<textarea class="input tx-serial" rows="2" placeholder="Serial / Tag — หนึ่งบรรทัดต่อชิ้น หรือคั่นด้วย ,"></textarea>'
    : '<input class="input tx-serial" list="serials-dl" placeholder="Serial ในคลัง — คั่นด้วย ,">';
  const div = document.createElement('div');
  div.className = 'tx-row' + (type === 'issue' ? ' issue' : '');
  div.innerHTML = `
    <div class="tx-item-wrap">
      <select class="input tx-item" onchange="App.onTxItemChange(this)" required>
        <option value="">— เลือกวัสดุ —</option>
        ${txItemOptions(type === 'issue')}
      </select>
      <button type="button" class="btn btn-outline btn-sm" onclick="App.scanToSelectItem(this)" title="สแกนบาร์โค้ดวัสดุ">${icon('camera', 14)}</button>
    </div>
    ${serialCol}
    <input class="input tx-qty" type="number" min="1" step="1" placeholder="จำนวน" required>
    <button type="button" class="btn-icon danger" onclick="App.removeTxRow(this)" title="ลบรายการ">${icon('trash', 16)}</button>`;
  rows.appendChild(div);
};

App.onTxItemChange = function (sel) {
  const row = sel.closest('.tx-row');
  if (!row) return;
  const it = Store.getItem(sel.value);
  row.classList.toggle('tracked', !!(it && it.trackSerial));
};

function parseSerials(v) {
  return String(v || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
}

App.removeTxRow = function (btn) { const r = btn.closest('.tx-row'); if (r) r.remove(); };

App.resetTxForm = function (type) {
  const c = type === 'receive' ? 'receive' : 'issue';
  const rows = document.getElementById(c + '-rows');
  if (rows) rows.innerHTML = '';
  App.addTxRow(type);
  const d = document.getElementById((type === 'receive' ? 'rv' : 'is') + '-date');
  const p = document.getElementById((type === 'receive' ? 'rv' : 'is') + '-party');
  const n = document.getElementById((type === 'receive' ? 'rv' : 'is') + '-note');
  if (d) d.value = todayStr();
  if (p) p.value = '';
  if (n) n.value = '';
};

App.onMissionChange = function () {
  const missionId = $('#is-mission').value;
  const groupSelect = $('#is-group');
  const groups = getMissionGroups(missionId);
  groupSelect.innerHTML = '<option value="">— เลือกกลุ่มงาน —</option>' +
    groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('') +
    '<option value="other">... พิมพ์เอง</option>';
  document.getElementById('is-group-custom').classList.add('hidden');
  /* ล้าง unit dropdown */
  const unitWrap = document.getElementById('is-unit-wrap');
  if (unitWrap) unitWrap.classList.add('hidden');
};

App.onGroupChange = function () {
  const groupId = $('#is-group').value;
  const unitWrap = document.getElementById('is-unit-wrap');
  const unitSelect = $('#is-unit');
  const customWrap = document.getElementById('is-group-custom');
  if (groupId === 'other') {
    customWrap.classList.remove('hidden');
    if (unitWrap) unitWrap.classList.add('hidden');
    return;
  }
  customWrap.classList.add('hidden');
  const units = getGroupUnits(groupId);
  if (units.length && unitWrap) {
    unitSelect.innerHTML = '<option value="">— เลือกงาน —</option>' +
      units.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('') +
      '<option value="other">... พิมพ์เอง</option>';
    unitWrap.classList.remove('hidden');
  } else if (unitWrap) {
    unitWrap.classList.add('hidden');
  }
};

App.submitReceive = function (ev) {
  ev.preventDefault();
  const me = Auth.current();
  const date = $('#rv-date').value || todayStr();
  const party = $('#rv-party').value.trim();
  const note = $('#rv-note').value.trim();
  const lines = collectTxLines('receive');
  if (!lines) return;
  const tx = { id: uid('tx'), type: 'receive', no: Store.nextTxNo('receive'), date, party, note, by: me.id, byName: me.name, items: lines };
  Store.addTransaction(tx);
  toast(`บันทึกรับเข้าเรียบร้อย ${tx.no}`);
  Telegram.notifyReceive(tx);
  App.go('#/receive');
};

App.submitIssue = function (ev) {
  ev.preventDefault();
  const me = Auth.current();
  const date = $('#is-date').value || todayStr();
  const missionId = $('#is-mission').value;
  let groupId = $('#is-group').value;
  let groupName = '';
  if (groupId === 'other') {
    groupName = $('#is-group-custom').value.trim();
  } else {
    groupName = getGroupName(groupId);
  }
  let unitVal = '';
  const unitWrap = document.getElementById('is-unit-wrap');
  if (unitWrap && !unitWrap.classList.contains('hidden')) {
    unitVal = $('#is-unit').value;
    if (unitVal === 'other') unitVal = $('#is-unit-custom').value.trim();
  }
  const missionName = getMissionName(missionId);
  const party = unitVal || groupName || missionName;
  const note = $('#is-note').value.trim();
  if (!missionId) { toast('กรุณาเลือกภารกิจ', 'error'); return; }
  if (!groupId && !groupName) { toast('กรุณาเลือกกลุ่มงาน', 'error'); return; }
  const lines = collectTxLines('issue');
  if (!lines) return;
  const tx = { id: uid('tx'), type: 'issue', no: Store.nextTxNo('issue'), date, party, note, by: me.id, byName: me.name, items: lines, mission: missionId, group: groupId === 'other' ? '' : groupId };
  Store.addTransaction(tx);
  toast(`บันทึกจำหน่ายเรียบร้อย ${tx.no}`);
  Telegram.notifyIssue(tx);
  App.go('#/issue');
};

function collectTxLines(type) {
  const rows = document.querySelectorAll('#' + (type === 'receive' ? 'receive' : 'issue') + '-rows .tx-row');
  const stockMap = {};
  Store.getStock().forEach(s => { stockMap[s.id] = s; });
  const lines = [];
  const seenSerials = {}; /* itemId -> Set สำหรับกันซ้ำในเอกสาร */
  for (const r of rows) {
    const itemId = r.querySelector('.tx-item').value;
    if (!itemId) { toast('กรุณาเลือกวัสดุในทุกรายการ', 'error'); return null; }
    const it = Store.getItem(itemId);

    if (it.trackSerial) {
      /* วัสดุแบบติดตามรายชิ้น: ต้องระบุ Serial */
      const serials = parseSerials(r.querySelector('.tx-serial').value);
      if (!serials.length) { toast(`ต้องระบุ Serial Number สำหรับ ${it.name}`, 'error'); return null; }
      const set = (seenSerials[itemId] = seenSerials[itemId] || new Set());
      const avail = new Set(Store.serialsInStock(itemId).map(x => x.serial));
      for (const s of serials) {
        if (set.has(s)) { toast(`Serial "${s}" ซ้ำในเอกสารนี้ (${it.name})`, 'error'); return null; }
        if (type === 'receive') {
          if (avail.has(s)) { toast(`Serial "${s}" ยังอยู่ในคลัง (${it.name})`, 'error'); return null; }
        } else {
          if (!avail.has(s)) { toast(`Serial "${s}" ไม่พบในคลัง (${it.name})`, 'error'); return null; }
        }
        set.add(s);
      }
      if (type === 'receive') {
        lines.push({ itemId, name: it.name, qty: serials.length, price: null, serials });
      } else {
        lines.push({ itemId, name: it.name, qty: serials.length, price: null, serials });
      }
      continue;
    }

    /* วัสดุทั่วไป: นับจำนวน */
    const qty = Number(r.querySelector('.tx-qty').value);
    if (!qty || qty <= 0) { toast('กรุณาระบุจำนวนที่ถูกต้อง', 'error'); return null; }
    if (type === 'issue') {
      const avail = stockMap[itemId] ? stockMap[itemId].qty : 0;
      if (qty > avail) { toast(`จำนวนไม่เพียงพอ: ${it.name} คงเหลือ ${fmtQty(avail)} ${it.unit}`, 'error'); return null; }
      lines.push({ itemId, name: it.name, qty, price: null, serials: [] });
    } else {
      lines.push({ itemId, name: it.name, qty, price: null, serials: [] });
    }
  }
  if (!lines.length) { toast('กรุณาเพิ่มรายการวัสดุอย่างน้อย 1 รายการ', 'error'); return null; }
  return lines;
}

function txRowHtml(t) {
  const type = t.type;
  const value = fmtQty(t.items.reduce((s, l) => s + l.qty, 0)) + ' ชิ้น';
  return `<tr class="clickable" onclick="App.toggleTxDetail('${t.id}')">
    <td class="td-mono">${esc(t.no)}</td>
    <td>${fmtDate(t.date)}</td>
    <td>${esc(t.party)}</td>
    <td>${esc(t.items[0].name)}${t.items.length > 1 ? ` <span class="muted small">+${t.items.length - 1} รายการ</span>` : ''}</td>
    <td class="num">${value}</td>
    <td class="muted">${esc(t.byName)}</td>
    <td class="actions">
      <button class="btn-icon" onclick="event.stopPropagation();App.printTxDoc('${t.id}')" title="พิมพ์ใบ${t.type === 'receive' ? 'รับเข้า' : 'เบิก'}วัสดุ">${icon('printer', 16)}</button>
      ${isAdmin() ? `<button class="btn-icon danger" onclick="event.stopPropagation();App.delTx('${t.id}')" title="ลบรายการ">${icon('trash', 16)}</button>` : ''}
    </td>
  </tr>
  <tr id="txd-${t.id}" class="hidden"><td colspan="7">
    <div class="tx-detail-inner">
      <table class="mini-table">
        <thead><tr><th>รายการวัสดุ</th><th class="num">จำนวน</th><th>หน่วย</th></tr></thead>
        <tbody>${t.items.map(l => `<tr>
          <td>${esc(l.name)}${l.serials && l.serials.length ? `<div class="muted small">Serial: ${esc(l.serials.join(', '))}</div>` : ''}</td>
          <td class="num">${fmtQty(l.qty)}</td>
          <td>${esc((Store.getItem(l.itemId) || {}).unit || '')}</td>
        </tr>`).join('')}</tbody>
      </table>
      ${t.note ? `<div class="tx-note">หมายเหตุ: ${esc(t.note)}</div>` : ''}
    </div>
  </td></tr>`;
}

function renderTxHistory(type) {
  const txs = Store.transactions().filter(t => t.type === type);
  const title = type === 'receive' ? 'ประวัติรับเข้าวัสดุ' : 'ประวัติจำหน่าย / เบิกจ่าย';
  const partyCol = 'ผู้รับ / หน่วยงาน';
  const allGroups = MISSIONS.flatMap(m => m.groups.map(g => ({ id: g.id, name: g.name, mission: m.name })));
  const deptOptions = allGroups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  const rows = txs.map(txRowHtml).join('');

  return `
  <div class="card">
    <div class="card-head"><div><h3>${title}</h3><p class="muted small">คลิกแถวเพื่อดูรายละเอียดรายการ</p></div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${type === 'issue' ? `<select class="input" id="tx-dept-filter" style="width:180px" onchange="App.filterTx('${type}')">
          <option value="">ทุกกลุ่มงาน</option>
          ${deptOptions}
        </select>` : ''}
        <div class="search-box">${icon('search', 16)}<input class="input" id="tx-search" placeholder="ค้นหาเลขที่ / ฝ่าย..." oninput="App.filterTx('${type}')"></div>
      </div>
    </div>
    <div class="table-wrap">
      <table class="list"><thead><tr>
        <th>เลขที่</th><th>วันที่</th><th>${partyCol}</th><th>รายการ</th><th class="num">จำนวนรวม</th><th>ผู้บันทึก</th><th></th>
      </tr></thead>
      <tbody id="tx-body-${type}">${rows || '<tr><td colspan="7"><div class="empty">' + icon('box', 34) + '<span>ยังไม่มีรายการ</span></div></td></tr>'}</tbody></table>
    </div>
  </div>`;
}

App.filterTx = function (type) {
  const q = ($('#tx-search').value || '').toLowerCase();
  const groupFilter = $('#tx-dept-filter') ? $('#tx-dept-filter').value : '';
  const txs = Store.transactions().filter(t => t.type === type);
  const body = $('#tx-body-' + type);
  if (!body) return;
  const rows = txs.filter(t =>
    (!q || t.no.toLowerCase().includes(q) || t.party.toLowerCase().includes(q) || t.items.some(l => l.name.toLowerCase().includes(q))) &&
    (!groupFilter || (t.group === groupFilter))
  );
  body.innerHTML = rows.map(txRowHtml).join('') || `<tr><td colspan="7"><div class="empty">${icon('search', 34)}<span>ไม่พบรายการที่ค้นหา</span></div></td></tr>`;
};

App.toggleTxDetail = function (id) {
  const el = document.getElementById('txd-' + id);
  if (el) el.classList.toggle('hidden');
};

App.printTxDoc = function (id) { exportTxDoc(id); };

App.printLabel = function (id) { exportLabelSheet(id, 2); };

App.viewSerials = function (itemId) {
  const it = Store.getItem(itemId);
  if (!it) return;
  const m = Store.serialMap()[itemId] || {};
  const rows = Object.values(m).sort((a, b) => a.serial.localeCompare(b.serial));
  const inStock = rows.filter(x => x.receive && !x.issue).length;
  const outCount = rows.length - inStock;
  const body = rows.length
    ? `<div class="summary-strip">
        <span class="summary-item">ทั้งหมด <b>${rows.length}</b> Serial</span>
        <span class="summary-item">ในคลัง <b>${inStock}</b> รายการ</span>
        <span class="summary-item">เบิกออกแล้ว <b>${outCount}</b> รายการ</span>
      </div>
      <div class="table-wrap"><table class="list"><thead><tr>
        <th>Serial / Tag</th><th>สถานะ</th><th>รับเข้า</th><th>เบิกออก (ผู้รับ / หน่วยงาน)</th>
      </tr></thead><tbody>
      ${rows.map(x => `<tr>
        <td class="td-mono"><strong>${esc(x.serial)}</strong></td>
        <td>${x.receive && !x.issue ? '<span class="badge badge-success">ในคลัง</span>' : '<span class="badge badge-issue">เบิกออกแล้ว</span>'}</td>
        <td>${x.receive ? `${fmtDate(x.receive.date)} <span class="muted small">(${esc(x.receive.no)})</span>` : '<span class="muted small">—</span>'}</td>
        <td>${x.issue ? `${esc(x.issue.party)} <span class="muted small">${fmtDate(x.issue.date)} (${esc(x.issue.no)})</span>` : '<span class="muted small">—</span>'}</td>
      </tr>`).join('')}
      </tbody></table></div>`
    : `<div class="empty">${icon('hash', 34)}<span>ยังไม่มีข้อมูล Serial สำหรับวัสดุนี้</span></div>`;
  openModal(modalShell(`Serial ของ ${esc(it.name)} (${esc(it.code)})`, body));
};

App.printAllLabels = function () { exportLabelSheetAll(); };

App.renderLabels = function (id) {
  const it = Store.getItem(id);
  const n = Math.max(1, Math.min(50, Number(document.getElementById('label-copies').value) || 1));
  const sheet = document.getElementById('label-sheet');
  if (it && sheet) sheet.innerHTML = Array.from({ length: n }, () => labelHtml(it)).join('');
};

App.delTx = function (id) {
  const t = Store.transactions().find(x => x.id === id);
  if (!t) return;
  confirmAction('ลบรายการ', `ต้องการลบเอกสาร <strong>${esc(t.no)}</strong> ใช่หรือไม่? การลบจะส่งผลต่อยอดคงเหลือ`, () => {
    Store.deleteTransaction(id);
    toast('ลบรายการเรียบร้อย', 'info');
    route();
  }, 'ลบรายการ');
};function renderTxForm(type) {
  const isRcv = type === 'receive';
  const idP = isRcv ? 'rv' : 'is';
  const missionOptions = MISSIONS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  return `
  <div class="card">
    <div class="card-head"><div><h3>${isRcv ? 'บันทึกการรับเข้าวัสดุ' : 'บันทึกการจำหน่าย / เบิกจ่าย'}</h3>
      <p class="muted small">${isRcv ? 'บันทึกวัสดุที่รับเข้าคลัง' : 'ระบบตรวจสอบจำนวนคงเหลืออัตโนมัติก่อนบันทึก'}</p></div></div>
    <form id="${idP}-form" onsubmit="return App.${isRcv ? 'submitReceive' : 'submitIssue'}(event)">
      <div class="form-grid">
        <div class="field"><label>วันที่ ${isRcv ? 'รับเข้า' : 'จำหน่าย'} *</label>
          <input id="${idP}-date" type="date" class="input" value="${todayStr()}" required></div>
        ${isRcv 
          ? `<div class="field"><label>ผู้รับ / หน่วยงาน</label>
              <input id="${idP}-party" class="input" placeholder="เช่น แผนกบัญชี"></div>`
          : `<div class="field"><label>ภารกิจ *</label>
              <select id="${idP}-mission" class="input" required onchange="App.onMissionChange()">
                <option value="">— เลือกภารกิจ —</option>
                ${missionOptions}
              </select></div>
            <div class="field"><label>กลุ่มงาน *</label>
              <select id="${idP}-group" class="input" required onchange="App.onGroupChange()">
                <option value="">— เลือกกลุ่มงาน —</option>
              </select>
              <input id="${idP}-group-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่อกลุ่มงาน">
            </div>
            <div class="field hidden" id="is-unit-wrap"><label>งาน</label>
              <select id="${idP}-unit" class="input" onchange="document.getElementById('is-unit-custom').classList.toggle('hidden', this.value !== 'other')">
                <option value="">— เลือกงาน —</option>
              </select>
              <input id="${idP}-unit-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่องาน">
            </div>`}
      </div>
      <div class="field">
        <label>รายการวัสดุ *</label>
        <div id="${type}-rows"></div>
        <div class="row-actions">
          <button type="button" class="btn btn-soft" onclick="App.addTxRow('${type}')">${icon('plus', 16)} เพิ่มรายการ</button>
          <button type="button" class="btn btn-ghost" onclick="App.itemModalNew()">${icon('box', 16)} เพิ่มวัสดุใหม่</button>
        </div>
        ${!isRcv ? `<datalist id="serials-dl">${Store.serialsInStockList().map(x => {
          const it = Store.getItem(x.itemId);
          return `<option value="${esc(x.serial)}">[${esc(it ? it.code : '')}] ${esc(it ? it.name : '')}</option>`;
        }).join('')}</datalist>` : ''}
      </div>
      <div class="field"><label>หมายเหตุ</label>
        <textarea id="${idP}-note" class="input" rows="2" placeholder="ระบุรายละเอียดเพิ่มเติม (ไม่บังคับ)"></textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${icon('check', 16)} บันทึก${isRcv ? 'รับเข้า' : 'จำหน่าย'}</button>
        <button type="button" class="btn btn-ghost" onclick="App.resetTxForm('${type}')">ล้างฟอร์ม</button>
      </div>
    </form>
  </div>`;
}

/* ============================================================
   กลุ่มงาน / ภารกิจ
   ============================================================ */
function renderDepartments() {
  const stock = Store.getStock();
  const missionCards = MISSIONS.map(mission => {
    const groupCards = mission.groups.map(group => {
      const items = stock.filter(s => s.group === group.id);
      const totalQty = items.reduce((sum, s) => sum + s.qty, 0);
      const lowItems = items.filter(s => s.status !== 'ok');
      return `
        <a href="#/stock?group=${group.id}" class="group-card">
          <div class="group-card-inner">
            <div class="group-name">${esc(group.name)}</div>
            <div class="group-stats">
              <span>${items.length} รายการ</span>
              <span>${fmtQty(totalQty)} ชิ้น</span>
              ${lowItems.length ? `<span class="text-warning">⚠️ ${lowItems.length}</span>` : ''}
            </div>
          </div>
        </a>`;
    }).join('');

    const missionItems = stock.filter(s => mission.groups.some(g => g.id === s.group));
    const missionQty = missionItems.reduce((sum, s) => sum + s.qty, 0);

    return `
      <div class="mission-card card">
        <div class="mission-header">
          <div class="mission-icon">${icon('flag', 24)}</div>
          <div>
            <h3 class="mission-name">${esc(mission.name)}</h3>
            <p class="muted small">${mission.groups.length} กลุ่มงาน • ${missionItems.length} รายการ • ${fmtQty(missionQty)} ชิ้น</p>
          </div>
        </div>
        <div class="group-grid">
          ${groupCards}
        </div>
      </div>`;
  }).join('');

  const noGroupItems = stock.filter(s => !s.group);
  const noGroupSection = noGroupItems.length ? `
    <div class="mission-card card card-muted">
      <div class="mission-header">
        <div class="mission-icon mission-icon-muted">${icon('info', 24)}</div>
        <div>
          <h3 class="mission-name">ไม่ระบุกลุ่มงาน</h3>
          <p class="muted small">${noGroupItems.length} รายการ • ${fmtQty(noGroupItems.reduce((sum, s) => sum + s.qty, 0))} ชิ้น</p>
        </div>
      </div>
    </div>` : '';

  return `
  ${missionCards}
  ${noGroupSection}`;
}

/* ============================================================
   คงเหลือ
   ============================================================ */
function renderStock() {
  const fullHash = (location.hash || '').replace(/^#\//, '');
  const queryString = fullHash.includes('?') ? fullHash.split('?')[1] : '';
  const queryParams = Object.fromEntries(new URLSearchParams(queryString));
  const groupParam = queryParams.group || '';
  const groupName = groupParam ? getGroupName(groupParam) : '';
  const deptBanner = groupName ? `<div class="dept-filter-banner">
    <a href="#/departments" class="btn btn-soft btn-sm">← กลับ</a>
    <span>กลุ่มงาน: <strong>${esc(groupName)}</strong></span>
    <a href="#/stock" class="btn btn-ghost btn-sm">ล้างตัวกรอง</a>
  </div>` : '';
  return `
  ${deptBanner}
  <div class="card">
    <div class="toolbar">
      <div class="search-box">${icon('search', 16)}<input class="input" id="st-search" placeholder="ค้นหา หรือสแกนบาร์โค้ด..." oninput="App.filterStock()" onkeydown="App.scanEnter(event)"></div>
      <button class="btn btn-outline" onclick="App.openScanner()" title="สแกน QR ด้วยกล้อง">${icon('camera', 16)} สแกน QR</button>
      <select class="input" id="st-cat" style="width:200px" onchange="App.filterStock()">
        <option value="">ทุกหมวดหมู่</option>
        ${Store.categories().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <button class="btn btn-outline" onclick="App.importItemsExcel()">${icon('download', 16)} Import Excel</button>
      <button class="btn btn-soft" onclick="App.printAllLabels()">${icon('tag', 16)} พิมพ์ป้ายทั้งหมด</button>
      <button class="btn btn-primary" onclick="App.itemModalNew()">${icon('plus', 16)} เพิ่มวัสดุ</button>
      <a href="#/reports" class="btn btn-outline">${icon('chart', 16)} รายงาน</a>
    </div>
    <div class="toolbar-summary" id="st-summary"></div>
    <div class="table-wrap">
      <table class="list"><thead><tr>
        <th>รหัส</th><th>รายการวัสดุ</th><th>หมวดหมู่</th><th>หน่วย</th><th class="num">คงเหลือ</th>
        <th>สถานะ</th><th></th>
      </tr></thead>
      <tbody id="st-body"></tbody></table>
    </div>
  </div>`;
}

/* ---------- การสแกน QR / บาร์โค้ด ---------- */
function handleScanResult(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return;
  const it = Store.items().find(i => i.code.toUpperCase() === code || i.id === code);
  const search = document.getElementById('st-search');
  if (search) {
    search.value = code;
    App.filterStock();
  }
  if (!it) { toast(`ไม่พบวัสดุ รหัส "${esc(code)}"`, 'error'); return; }
  const row = document.querySelector('#st-body tr[data-id="' + it.id + '"]');
  if (row) {
    row.classList.remove('row-flash');
    void row.offsetWidth; /* รีสตาร์ทแอนิเมชัน */
    row.classList.add('row-flash');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.classList.remove('row-flash'), 3400);
  }
  toast(`พบวัสดุ: ${it.name} (${it.code})`);
}

App.scanEnter = function (ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); handleScanResult(ev.target.value); }
};

App.stopScanner = function () {
  const s = window.__scanner;
  if (s) {
    window.__scanner = null;
    try { s.stop().then(() => {}).catch(() => {}); } catch (e) { /* ignore */ }
  }
};

App.openScanner = function () {
  const modal = openModal(`
    <div class="modal-head"><h3>สแกน QR วัสดุ</h3><button class="btn-icon" onclick="App.stopScanner();closeModal()" title="ปิด">${icon('x', 18)}</button></div>
    <div class="modal-body">
      <div id="qr-reader" class="qr-reader"></div>
      <div class="scanner-hint">${icon('info', 16)} จัด QR Code บนป้ายวัสดุให้อยู่ในกรอบสแกน</div>
      <p class="muted small" style="text-align:center">ใช้เครื่องสแกนบาร์โค้ดได้เช่นกัน: พิมพ์รหัสในช่องค้นหาหน้าคงเหลือแล้วกด Enter</p>
    </div>`, { noDismiss: true });
  startScanner();
  return modal;
};

App.scanToSelectItem = function (btn) {
  const row = btn.closest('.tx-row');
  const select = row.querySelector('.tx-item');
  const scanner = openModal(`
    <div class="modal-head"><h3>สแกนบาร์โค้ดวัสดุ</h3><button class="btn-icon" onclick="App.stopScanner();closeModal()" title="ปิด">${icon('x', 18)}</button></div>
    <div class="modal-body">
      <div id="qr-reader-scan" class="qr-reader"></div>
      <div class="scanner-hint">${icon('info', 16)} จัดบาร์โค้ด / QR Code ให้อยู่ในกรอบสแกน</div>
    </div>`, { noDismiss: true });
  startScannerForSelect(select);
  return scanner;
};

function startScannerForSelect(selectEl) {
  const el = document.getElementById('qr-reader-scan');
  if (!el) return;
  if (typeof Html5Qrcode !== 'function') {
    el.innerHTML = `<div class="empty">${icon('alert', 30)}<span>ไม่พบไลบรารีสแกน QR (ออฟไลน์)<br>พิมพ์รหัสในช่องค้นหาแทนได้</span></div>`;
    return;
  }
  window.__scanner = new Html5Qrcode('qr-reader-scan');
  window.__scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    text => {
      App.stopScanner();
      closeModal();
      const code = String(text || '').trim();
      if (!code) return;
      const it = Store.items().find(i => i.code.toUpperCase() === code.toUpperCase() || i.id === code);
      if (!it) { toast(`ไม่พบรหัสวัสดุ "${esc(code)}"`, 'error'); return; }
      selectEl.value = it.id;
      App.onTxItemChange(selectEl);
      toast(`พบวัสดุ: ${it.name} (${it.code})`);
    },
    () => {}
  ).catch(() => {
    window.__scanner = null;
    el.innerHTML = `<div class="empty">${icon('alert', 30)}<span>เปิดกล้องไม่สำเร็จ<br>ตรวจสอบสิทธิ์การใช้งานกล้อง</span></div>`;
  });
}

function startScanner() {
  const el = document.getElementById('qr-reader');
  if (!el) return;
  if (typeof Html5Qrcode !== 'function') {
    el.innerHTML = `<div class="empty">${icon('alert', 30)}<span>ไม่พบไลบรารีสแกน QR (ออฟไลน์)<br>ใช้เครื่องสแกนบาร์โค้ดพิมพ์รหัสในช่องค้นหาแทนได้</span></div>`;
    return;
  }
  window.__scanner = new Html5Qrcode('qr-reader');
  window.__scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    text => { App.stopScanner(); closeModal(); handleScanResult(text); },
    () => { /* ข้าม error รายเฟรม */ }
  ).catch(() => {
    window.__scanner = null;
    el.innerHTML = `<div class="empty">${icon('alert', 30)}<span>เปิดกล้องไม่สำเร็จ<br>ตรวจสอบสิทธิ์การใช้งานกล้อง หรือใช้เครื่องสแกนบาร์โค้ดแทน</span></div>`;
  });
}

App.filterStock = function (params) {
  const q = ($('#st-search').value || '').toLowerCase();
  const cat = $('#st-cat').value;
  const groupParam = params && params.group ? params.group : '';
  const stock = Store.getStock().filter(s =>
    (!q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) &&
    (!cat || s.category === cat) &&
    (!groupParam || s.group === groupParam)
  );
  const body = $('#st-body');
  if (!body) return;
  body.innerHTML = stock.map(s => `
    <tr data-id="${s.id}">
      <td class="td-mono">${esc(s.code)}</td>
      <td><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.location) || '—'}</div></td>
      <td><span class="chip-cat">${esc(s.category)}</span></td>
      <td>${esc(s.unit)}</td>
      <td class="num"><strong>${fmtQty(s.qty)}</strong> ${s.status === 'out' ? '<span class="muted small">(หมด)</span>' : ''}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="actions">
        ${s.trackSerial ? `<button class="btn-icon" onclick="App.viewSerials('${s.id}')" title="ดู Serial ในคลัง">${icon('hash', 16)}</button>` : ''}
        <button class="btn-icon" onclick="App.printLabel('${s.id}')" title="พิมพ์ป้ายวัสดุ">${icon('tag', 16)}</button>
        <button class="btn-icon" onclick="App.editItem('${s.id}')" title="แก้ไข">${icon('edit', 16)}</button>
        ${isAdmin() ? `<button class="btn-icon danger" onclick="App.delItem('${s.id}')" title="ลบ">${icon('trash', 16)}</button>` : ''}
      </td>
    </tr>`).join('') || `<tr><td colspan="8"><div class="empty">${icon('search', 34)}<span>ไม่พบรายการ</span></div></td></tr>`;
  const totQ = stock.reduce((a, s) => a + s.qty, 0);  $('#st-summary').innerHTML = `แสดง <b>${stock.length}</b> รายการ — จำนวนรวม <b>${fmtQty(totQ)}</b> ชิ้น`;
};

/* ---------- ฟอร์มวัสดุ (เพิ่ม/แก้ไข) ---------- */
App.itemModalNew = function () { itemModal(null); };

App.editItem = function (id) { itemModal(Store.getItem(id)); };

function itemModal(item) {
  const isEdit = !!item;
  const cats = Store.categories();
  const catList = cats.map(c => `<option value="${esc(c)}">`).join('');
  const missionOptions = MISSIONS.map(m => `<option value="${m.id}" ${item && item.mission === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const selectedMission = item ? item.mission : '';
  const selectedGroup = item ? item.group : '';
  const groups = selectedMission ? getMissionGroups(selectedMission) : [];
  const groupOptions = groups.map(g => `<option value="${g.id}" ${selectedGroup === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  openModal(modalShell(isEdit ? 'แก้ไขวัสดุ' : 'เพิ่มวัสดุใหม่',
    `<form id="item-form" class="form-grid" onsubmit="return false">
      <div class="field"><label>รหัสวัสดุ</label><input class="input" value="${isEdit ? esc(item.code) : 'สร้างอัตโนมัติ'}" disabled></div>
      <div class="field"><label>ชื่อวัสดุ *</label><input class="input" id="if-name" value="${esc(item ? item.name : '')}" placeholder="เช่น เมาส์ไร้สาย Logitech" required></div>
      <div class="field"><label>หมวดหมู่ *</label><input class="input" id="if-cat" list="cat-list" value="${esc(item ? item.category : '')}" placeholder="เลือกหรือพิมพ์หมวดหมู่" required>
        <datalist id="cat-list">${catList}</datalist></div>
      <div class="field"><label>ภารกิจ</label>
        <select id="if-mission" class="input" onchange="App.onItemMissionChange()">
          <option value="">— เลือกภารกิจ —</option>
          ${missionOptions}
        </select></div>
      <div class="field"><label>กลุ่มงาน</label>
        <select id="if-group" class="input" onchange="App.onItemGroupChange()">
          <option value="">— เลือกกลุ่มงาน —</option>
          ${groupOptions}
        </select></div>
      <div class="field hidden" id="if-unit-wrap"><label>งาน</label>
        <select id="if-work-unit" class="input">
          <option value="">— เลือกงาน —</option>
          ${selectedGroup ? getGroupUnits(selectedGroup).map(u => `<option value="${esc(u)}" ${item && item.workUnit === u ? 'selected' : ''}>${esc(u)}</option>`).join('') : ''}
        </select></div>
      <div class="field"><label>หน่วยนับ *</label><input class="input" id="if-unit" value="${esc(item ? item.unit : '')}" placeholder="ตัว / เครื่อง / เส้น" required></div>

      <div class="field"><label>จำนวนขั้นต่ำ (เตือนเมื่อใกล้หมด)</label><input class="input" id="if-min" type="number" min="0" step="1" value="${item ? item.minStock : 0}"></div>
      <div class="field full"><label class="check"><input type="checkbox" id="if-serial" ${item && item.trackSerial ? 'checked' : ''}> ติดตามเป็นรายชิ้น (Serial Number / Inventory Tag)</label>
        <span class="muted small">สำหรับวัสดุราคาสูง เช่น โน้ตบุ๊ก เครื่องพิมพ์ — ต้องระบุ Serial ทุกครั้งที่รับเข้า / จำหน่าย</span></div>
      <div class="field full"><label>สถานที่จัดเก็บ</label><input class="input" id="if-loc" value="${esc(item ? item.location : '')}" placeholder="เช่น ห้องพัสดุ ชั้น A"></div>
      <div class="field full"><label>หมายเหตุ</label><input class="input" id="if-note" value="${esc(item ? item.note : '')}"></div>
    </form>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.saveItem('${isEdit ? item.id : ''}')">${icon('check', 16)} บันทึก</button>`));
}

App.onItemMissionChange = function () {
  const missionId = $('#if-mission').value;
  const groupSelect = $('#if-group');
  const groups = getMissionGroups(missionId);
  groupSelect.innerHTML = '<option value="">— เลือกกลุ่มงาน —</option>' +
    groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  document.getElementById('if-unit-wrap').classList.add('hidden');
};

App.onItemGroupChange = function () {
  const groupId = $('#if-group').value;
  const unitWrap = document.getElementById('if-unit-wrap');
  const unitSelect = $('#if-work-unit');
  const units = getGroupUnits(groupId);
  if (units.length) {
    unitSelect.innerHTML = '<option value="">— เลือกงาน —</option>' +
      units.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
    unitWrap.classList.remove('hidden');
  } else {
    unitWrap.classList.add('hidden');
  }
};

App.saveItem = function (id) {
  const name = $('#if-name').value.trim();
  const category = $('#if-cat').value.trim();
  const unit = $('#if-unit').value.trim();
  if (!name || !category || !unit) { toast('กรุณากรอกชื่อ หมวดหมู่ และหน่วยนับให้ครบ', 'error'); return; }
  const data = {
    name, category, unit,
    mission: $('#if-mission').value,
    group: $('#if-group').value,
    workUnit: $('#if-work-unit') ? $('#if-work-unit').value : '',
    price: 0,
    minStock: Number($('#if-min').value) || 0,
    location: $('#if-loc').value.trim(),
    note: $('#if-note').value.trim(),
    trackSerial: !!document.getElementById('if-serial').checked,
  };
  if (id && !data.trackSerial) {
    const serials = Store.serialMap()[id] || {};
    if (Object.values(serials).some(x => x.receive && !x.issue)) {
      toast('ไม่สามารถปิดการติดตาม Serial ได้ เนื่องจากยังมี Serial คงเหลือในคลัง', 'error');
      return;
    }
  }
  if (id) {
    Store.updateItem(id, data);
    toast('บันทึกการแก้ไขวัสดุเรียบร้อย');
  } else {
    const it = Store.addItem(data);
    toast(`เพิ่มวัสดุเรียบร้อย ${it.code}`);
  }
  closeModal();
  route();
};

App.delItem = function (id) {
  const it = Store.getItem(id);
  if (!it) return;
  confirmAction('ลบวัสดุ',
    `ต้องการลบ <strong>${esc(it.name)}</strong> ใช่หรือไม่?<br><span class="muted small">ประวัติการเคลื่อนไหวจะยังคงอยู่ แต่รายการนี้จะไม่แสดงในคงเหลือ</span>`,
    () => { Store.deleteItem(id); toast('ลบวัสดุเรียบร้อย', 'info'); route(); }, 'ลบวัสดุ');
};

/* ============================================================
   รายงาน
   ============================================================ */
function renderReports() {
  return `
  <div class="card">
    <div class="card-head">
      <div><h3>ออกรายงาน</h3><p class="muted small">เลือกรายงาน กำหนดช่วงเวลา แล้วส่งออกเป็น Excel หรือ PDF</p></div>
    </div>
    <div class="toolbar">
      <div class="seg" id="rep-seg">
        <button class="seg-btn ${REP.type === 'stock' ? 'active' : ''}" onclick="App.setReport('stock')">คงเหลือ</button>
        <button class="seg-btn ${REP.type === 'receive' ? 'active' : ''}" onclick="App.setReport('receive')">รับเข้า</button>
        <button class="seg-btn ${REP.type === 'issue' ? 'active' : ''}" onclick="App.setReport('issue')">จำหน่าย</button>
      </div>
      <div id="rep-range" class="${REP.type === 'stock' ? 'hidden' : ''}">
        <span class="muted small">จาก</span>
        <input type="date" class="input" id="rep-from" style="width:155px" value="${REP.from}" onchange="App.applyRange()">
        <span class="muted small">ถึง</span>
        <input type="date" class="input" id="rep-to" style="width:155px" value="${REP.to}" onchange="App.applyRange()">
      </div>
      <div class="spacer"></div>
      <button class="btn btn-success" onclick="App.exportCurrent('excel')">${icon('download', 16)} ส่งออก Excel</button>
      <button class="btn btn-primary" onclick="App.exportCurrent('pdf')">${icon('printer', 16)} ส่งออก PDF</button>
    </div>
    <div class="rep-preview" id="rep-preview"></div>
  </div>`;
}

App.setReport = function (type) {
  REP.type = type;
  renderReportPreview();
  const seg = $('#rep-seg');
  if (seg) seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick').includes("'" + type + "'")));
  const range = $('#rep-range');
  if (range) range.classList.toggle('hidden', type === 'stock');
};

App.applyRange = function () {
  REP.from = $('#rep-from').value;
  REP.to = $('#rep-to').value;
  renderReportPreview();
};

function reportData(type) {
  if (type === 'stock') {
    const stock = Store.getStock();
    const cols = [
      { label: 'ลำดับ', align: 'right' }, { label: 'รหัสวัสดุ' }, { label: 'รายการวัสดุ' }, { label: 'หมวดหมู่' },
      { label: 'หน่วย' }, { label: 'คงเหลือ', align: 'right' }, { label: 'สถานะ' },
    ];
    const rows = stock.map((s, i) => [
      i + 1, s.code, s.name, s.category, s.unit, fmtQty(s.qty),
      s.status === 'out' ? 'หมดคลัง' : s.status === 'low' ? 'ใกล้หมด' : 'เพียงพอ',
    ]);
    const totQ = stock.reduce((a, s) => a + s.qty, 0);
    return {
      title: 'รายงานคงเหลือวัสดุ',
      subtitle: `ณ วันที่ ${fmtDate(todayStr())} — จำนวน ${stock.length} รายการ`,
      cols, rows,
      totalsRow: ['', '', '', '', 'รวม', fmtQty(totQ), ''],
    };
  }
  const txs = Store.transactions().filter(t =>
    t.type === type && (!REP.from || t.date >= REP.from) && (!REP.to || t.date <= REP.to)
  );
  const isRcv = type === 'receive';
  const label = isRcv ? 'รับเข้า' : 'จำหน่าย';
  const cols = [
    { label: 'ลำดับ', align: 'right' }, { label: 'เลขที่เอกสาร' }, { label: 'วันที่' },
    { label: 'รหัส' }, { label: 'รายการวัสดุ' }, { label: 'จำนวน', align: 'right' }, { label: 'หน่วย' }, { label: 'หมายเหตุ' },
  ];
  const rows = [];
  let idx = 0, totQ = 0;
  txs.forEach(t => t.items.forEach(l => {
    idx++;
    totQ += l.qty;
    const it = Store.getItem(l.itemId) || {};
    const lineName = l.name + (l.serials && l.serials.length ? ` (${l.serials.join(', ')})` : '');
    rows.push([idx, t.no, fmtDate(t.date), it.code || '', lineName, fmtQty(l.qty), it.unit || '', t.note || '']);
  }));
  const rangeTxt = `${REP.from ? 'ตั้งแต่วันที่ ' + fmtDate(REP.from) : 'ทั้งหมด'}${REP.to ? ' ถึง ' + fmtDate(REP.to) : ''}`;
  return {
    title: `รายงาน${label}วัสดุ`,
    subtitle: `${rangeTxt} — ${txs.length} เอกสาร / ${idx} รายการ`,
    cols, rows,
    totalsRow: ['', '', '', '', 'รวม', fmtQty(totQ), '', ''],
  };
}

function renderReportPreview() {
  const box = $('#rep-preview');
  if (!box) return;
  const d = reportData(REP.type);
  box.innerHTML = `<table class="list">${buildTableHtml(d.cols, d.rows)}${d.totalsRow ? `<tfoot><tr>${d.totalsRow.map(c => `<td class="num" style="font-weight:700;background:#f8fafc;border-top:1.5px solid #cbd5e1">${c}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
}

App.exportCurrent = function (fmt) {
  const d = reportData(REP.type);
  const stamp = todayStr();
  const fname = `รายงาน${d.title.replace('รายงาน', '')}_${stamp}.xlsx`;
  if (fmt === 'excel') exportExcel(fname, d.cols, d.rows, d.title);
  else exportPDF(d.title, d.subtitle, d.cols, d.rows, { totalsRow: d.totalsRow });
};

/* ============================================================
   ผู้ใช้งาน (เฉพาะผู้ดูแลระบบ)
   ============================================================ */
function renderUsers() {
  const me = Auth.current();
  const rows = Store.users().map(u => `
    <tr>
      <td><div class="user-cell"><div class="avatar sm">${esc((u.name || '?')[0])}</div>
        <div><strong>${esc(u.name)}</strong><div class="muted small">@${esc(u.username)}</div></div></div></td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.id === me.id ? '<span class="muted small">(บัญชีของคุณ)</span>' : ''}</td>
      <td class="actions">
        <button class="btn-icon" onclick="App.editUser('${u.id}')" title="แก้ไขผู้ใช้">${icon('edit', 16)}</button>
        ${u.id !== me.id ? `<button class="btn-icon danger" onclick="App.delUser('${u.id}')" title="ลบผู้ใช้">${icon('trash', 16)}</button>` : ''}
      </td>
    </tr>`).join('');

  return `
  <div class="card">
    <div class="card-head"><div><h3>จัดการผู้ใช้งาน</h3><p class="muted small">สร้างบัญชี และกำหนดสิทธิ์การใช้งานระบบ</p></div>
      <button class="btn btn-outline" onclick="App.importUsersExcel()">${icon('download', 16)} Import Excel</button>
      <button class="btn btn-primary" onclick="App.addUserModal()">${icon('plus', 16)} เพิ่มผู้ใช้</button></div>
    <div class="table-wrap">
      <table class="list"><thead><tr><th>ชื่อ-นามสกุล</th><th>บทบาท</th><th></th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
  </div>`;
}

App.addUserModal = function () {
  openModal(modalShell('เพิ่มผู้ใช้งาน',
    `<form id="user-form" class="form-grid" onsubmit="return false">
      <div class="field"><label>ชื่อผู้ใช้ (username) *</label><input class="input" id="uf-user" placeholder="เช่น itstaff" required></div>
      <div class="field"><label>ชื่อ-นามสกุล *</label><input class="input" id="uf-name" placeholder="เช่น นายสมชาย ใจดี" required></div>
      <div class="field"><label>รหัสผ่าน *</label><input class="input" id="uf-pass" type="password" minlength="4" placeholder="อย่างน้อย 4 ตัวอักษร" required></div>
      <div class="field"><label>บทบาท *</label>
        <select class="input" id="uf-role">
          <option value="user">เจ้าหน้าที่ (บันทึกข้อมูลได้)</option>
          <option value="admin">ผู้ดูแลระบบ (จัดการทุกอย่าง)</option>
        </select></div>
    </form>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.saveUser()">${icon('check', 16)} บันทึก</button>`));
};

App.saveUser = function () {
  const username = $('#uf-user').value.trim();
  const name = $('#uf-name').value.trim();
  const pass = $('#uf-pass').value;
  const role = $('#uf-role').value;
  if (!username || !name || !pass) { toast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
  if (Store.findUser(username)) { toast('ชื่อผู้ใช้นี้มีอยู่แล้ว', 'error'); return; }
  Store.addUser({ username, name, password: pass, role });
  toast('เพิ่มผู้ใช้เรียบร้อย');
  closeModal();
  route();
};

App.editUser = function (id) {
  const u = Store.users().find(x => x.id === id);
  if (!u) return;
  const canDemote = !(u.role === 'admin' && Store.users().filter(x => x.role === 'admin').length === 1);
  openModal(modalShell('แก้ไขผู้ใช้งาน',
    `<form id="user-form" class="form-grid" onsubmit="return false">
      <div class="field"><label>ชื่อ-นามสกุล</label><input class="input" id="uf-name" value="${esc(u.name)}" required></div>
      <div class="field"><label>บทบาท</label>
        <select class="input" id="uf-role" ${canDemote ? '' : 'disabled'}>
          <option value="user" ${u.role === 'user' ? 'selected' : ''}>เจ้าหน้าที่ (บันทึกข้อมูลได้)</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ (จัดการทุกอย่าง)</option>
        </select></div>
      <div class="field full"><label>รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)</label><input class="input" id="uf-pass" type="password" minlength="4" placeholder="อย่างน้อย 4 ตัวอักษร"></div>
    </form>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.saveUserEdit('${u.id}')">${icon('check', 16)} บันทึก</button>`));
};

App.saveUserEdit = function (id) {
  const name = $('#uf-name').value.trim();
  const role = $('#uf-role').value;
  const pass = $('#uf-pass').value;
  if (!name) { toast('กรุณากรอกชื่อ-นามสกุล', 'error'); return; }
  const data = { name, role };
  if (pass) data.password = pass;
  Store.updateUser(id, data);
  toast('บันทึกการแก้ไขเรียบร้อย');
  closeModal();
  route();
};

App.delUser = function (id) {
  const u = Store.users().find(x => x.id === id);
  if (!u) return;
  if (u.role === 'admin' && Store.users().filter(x => x.role === 'admin').length === 1) {
    toast('ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้', 'error');
    return;
  }
  confirmAction('ลบผู้ใช้งาน', `ต้องการลบผู้ใช้ <strong>${esc(u.name)}</strong> (@${esc(u.username)}) ใช่หรือไม่?`,
    () => { Store.deleteUser(id); toast('ลบผู้ใช้เรียบร้อย', 'info'); route(); }, 'ลบผู้ใช้');
};

/* ---------- เปลี่ยนรหัสผ่านของตัวเอง ---------- */
App.openChangePw = function () {
  openModal(modalShell('เปลี่ยนรหัสผ่าน',
    `<form id="pw-form" class="form-grid" onsubmit="return false">
      <div class="field full"><label>รหัสผ่านปัจจุบัน</label><input id="pw-cur" type="password" class="input" required></div>
      <div class="field"><label>รหัสผ่านใหม่</label><input id="pw-new" type="password" class="input" minlength="4" required></div>
      <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input id="pw-new2" type="password" class="input" required></div>
    </form>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.savePw()">${icon('key', 16)} เปลี่ยนรหัสผ่าน</button>`));
};

App.savePw = function () {
  const me = Auth.current();
  const cur = $('#pw-cur').value;
  const nw = $('#pw-new').value;
  const nw2 = $('#pw-new2').value;
  if (nw !== nw2) { toast('รหัสผ่านใหม่ไม่ตรงกัน', 'error'); return; }
  if (!Auth.changePassword(me.id, cur, nw)) { toast('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error'); return; }
  toast('เปลี่ยนรหัสผ่านเรียบร้อย');
  closeModal();
};

/* ============================================================
   Import Excel — อ่านไฟล์ .xlsx/.xls/.csv
   ============================================================ */
function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(json);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
    reader.readAsArrayBuffer(file);
  });
}

App.importUsersExcel = function () {
  openModal(modalShell('Import รายชื่อเจ้าหน้าที่จาก Excel',
    `<div class="field">
      <label>เลือกไฟล์ Excel (.xlsx / .xls / .csv)</label>
      <input type="file" id="import-users-file" accept=".xlsx,.xls,.csv" class="input" style="padding:8px">
    </div>
    <div class="field">
      <p class="muted small" style="margin-bottom:8px"><strong>รูปแบบคอลัมน์ใน Excel:</strong></p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:13px;line-height:1.8">
        <code>username</code> — ชื่อผู้ใช้ (ล็อกอิน)<br>
        <code>name</code> — ชื่อ-นามสกุล<br>
        <code>password</code> — รหัสผ่าน (ถ้าเว้นว่างจะใช้ "1234")<br>
        <code>role</code> — บทบาท: <code>admin</code> หรือ <code>user</code> (ถ้าเว้นว่างจะใช้ "user")
      </div>
    </div>
    <div id="import-users-preview" class="muted small"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.doImportUsers()">${icon('check', 16)} Import</button>`));
};

App.doImportUsers = async function () {
  const fileInput = document.getElementById('import-users-file');
  if (!fileInput || !fileInput.files.length) { toast('กรุณาเลือกไฟล์ Excel', 'error'); return; }
  const preview = document.getElementById('import-users-preview');
  try {
    const rows = await readExcelFile(fileInput.files[0]);
    if (!rows.length) { toast('ไฟล์ว่างเปล่า ไม่มีข้อมูล', 'error'); return; }
    let added = 0, skipped = 0;
    rows.forEach(r => {
      const username = String(r.username || '').trim();
      const name = String(r.name || '').trim();
      const password = String(r.password || '1234').trim();
      const role = String(r.role || 'user').trim().toLowerCase();
      if (!username || !name) { skipped++; return; }
      if (Store.findUser(username)) { skipped++; return; }
      Store.addUser({ username, name, password, role: role === 'admin' ? 'admin' : 'user' });
      added++;
    });
    toast(`Import สำเร็จ: เพิ่ม ${added} ราย • ข้าม ${skipped} ราย`, added > 0 ? 'success' : 'info');
    closeModal();
    route();
  } catch (err) {
    toast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

App.importItemsExcel = function () {
  openModal(modalShell('Import อุปกรณ์/วัสดุจาก Excel',
    `<div class="field">
      <label>เลือกไฟล์ Excel (.xlsx / .xls / .csv)</label>
      <input type="file" id="import-items-file" accept=".xlsx,.xls,.csv" class="input" style="padding:8px">
    </div>
    <div class="field">
      <p class="muted small" style="margin-bottom:8px"><strong>รูปแบบคอลัมน์ใน Excel (รองรับ 2 รูปแบบ):</strong></p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:13px;line-height:1.8">
        <strong>รูปแบบที่ 1 (แนะนำ):</strong><br>
        <code>รหัส</code> — บาร์โค้ด/รหัสวัสดุ<br>
        <code>ชื่ออุปกรณ์</code> — ชื่ออุปกรณ์/วัสดุ *<br>
        <code>หน่วย</code> — หน่วยนับ (แผ่น/ขวด/กล่อง/ชิ้น)<br>
        <code>คงเหลือ</code> — จำนวนคงเหลือ (จะสร้างรายการรับเข้าอัตโนมัติ)<br>
        <code>ขั้นต่ำ</code> — จำนวนขั้นต่ำ (เตือนเมื่อใกล้หมด)<br>
        <strong>หมวดหมู่จะกำหนดอัตโนมัติจากชื่อวัสดุ</strong>
      </div>
    </div>
    <div id="import-items-preview" class="muted small"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.doImportItems()">${icon('check', 16)} Import</button>`));
};

/* ฟังก์ชันจัดหมวดหมู่อัตโนมัติจากชื่อวัสดุ */
function autoCategory(name) {
  const n = name.toLowerCase();
  if (/หมึก|toner|ตลับหมึก|ดรั้ม|หัวพิมพ์|ink|cartridge/.test(n)) return 'หมึกพิมพ์';
  if (/สาย|hDMI|vGA|lAN|ethernet|cable|cord/.test(n)) return 'สายไฟฟ้า';
  if (/เมาส์|mouse|แป้นพิมพ์|keyboard|หูฟัง|headset|card reader|usb|hub|converter|adapter|type-c|แผ่นรอง/.test(n)) return 'อุปกรณ์ต่อพ่วง';
  if (/switch|ethernet|router|access point|wifi|เครือข่าย/.test(n)) return 'เครือข่าย';
  if (/ssd|hdd|wd|sandisk|kingston|闪存|flash|usb drive|for\s*backup|สำรองข้อมูล|存储|storage/.test(n)) return 'อุปกรณ์เก็บข้อมูล';
  if (/ปลั๊ก|ไฟ|ups|สำรองไฟ|รางปลั๊ก|socket|power/.test(n)) return 'อุปกรณ์ไฟฟ้า';
  if (/ซีลิโคน|น้ำยา|ทำความสะอาด|clean|lens/.test(n)) return 'ทำความสะอาด';
  if (/print head|หัวพิมพ์/.test(n)) return 'หมึกพิมพ์';
  return 'ทั่วไป';
}

/* ฟังก์ชันจัดสถานที่จัดเก็บอัตโนมัติจากหมวดหมู่ */
function autoLocation(category) {
  const map = {
    'หมึกพิมพ์': 'ตู้ A',
    'สายไฟฟ้า': 'ตู้ B',
    'อุปกรณ์ต่อพ่วง': 'ตู้ B',
    'เครือข่าย': 'ห้องเซิร์ฟเวอร์',
    'อุปกรณ์เก็บข้อมูล': 'ตู้ B',
    'อุปกรณ์ไฟฟ้า': 'ตู้ C',
    'ทำความสะอาด': 'ตู้ C',
  };
  return map[category] || 'คลังสินค้า';
}

App.doImportItems = async function () {
  const fileInput = document.getElementById('import-items-file');
  if (!fileInput || !fileInput.files.length) { toast('กรุณาเลือกไฟล์ Excel', 'error'); return; }
  try {
    const rows = await readExcelFile(fileInput.files[0]);
    if (!rows.length) { toast('ไฟล์ว่างเปล่า ไม่มีข้อมูล', 'error'); return; }
    let added = 0, skipped = 0, stockAdded = 0;
    const Y = new Date().getFullYear();
    rows.forEach(r => {
      /* รองรับทั้ง 2 รูปแบบ: ชื่อคอลัมน์ไทยและอังกฤษ */
      const name = String(r['ชื่ออุปกรณ์'] || r.name || '').trim();
      if (!name) { skipped++; return; }
      const code = String(r['รหัส'] || r.code || '').trim();
      const unit = String(r['หน่วย'] || r.unit || 'ชิ้น').trim();
      const qty = Number(r['คงเหลือ'] || r.qty || r.stock) || 0;
      const minStock = Number(r['ขั้นต่ำ'] || r.minStock) || 0;
      const category = autoCategory(name);
      const location = autoLocation(category);
      const mission = String(r['ภารกิจ'] || r.mission || '').trim();
      const group = String(r['กลุ่มงาน'] || r.group || '').trim();
      const trackSerial = String(r.trackSerial || '').toLowerCase();
      
      /* เพิ่มวัสดุ */
      const it = Store.addItem({
        name,
        code: code || undefined, /* ใช้รหัสจาก Excel ถ้ามี */
        category,
        unit,
        minStock,
        location,
        mission,
        group,
        note: '',
        trackSerial: trackSerial === 'true' || trackSerial === '1' || trackSerial === 'yes',
      });
      added++;
      
      /* สร้างรายการรับเข้าถ้ายอดคงเหลือ > 0 */
      if (qty > 0) {
        const txNo = Store.nextTxNo('receive');
        Store.addTransaction({
          id: uid('tx'), type: 'receive',
          no: txNo,
          date: todayStr(),
          party: 'นำเข้าจาก Excel',
          note: `Import ${name}`,
          by: (Auth.current() || {}).username || 'admin',
          byName: (Auth.current() || {}).name || 'ผู้ดูแลระบบ',
          items: [{ itemId: it.id, name: it.name, qty, serials: [] }],
        });
        stockAdded++;
      }
    });
    toast(`Import สำเร็จ: เพิ่ม ${added} รายการ • สร้างรายการรับเข้า ${stockAdded} รายการ • ข้าม ${skipped} รายการ`, added > 0 ? 'success' : 'info');
    closeModal();
    route();
  } catch (err) {
    toast('เกิดข้อผิดพลาด: ' + err.message, 'error');
  }
};

/* ============================================================
   ตั้งค่า (Settings)
   ============================================================ */
function renderSettings() {
  const cfg = Telegram.getConfig();
  return `
  <div class="card">
    <div class="card-head"><div><h3>ตั้งค่าระบบแจ้งเตือน Telegram</h3>
      <p class="muted small">เชื่อมต่อ Telegram เพื่อรับแจ้งเตือนเมื่อมีการรับเข้า/จำหน่ายวัสดุ หรือวัสดุใกล้หมด</p></div></div>
    <form id="tg-form" class="form-grid" onsubmit="return false">
      <div class="field full">
        <label class="check">
          <input type="checkbox" id="tg-enabled" ${cfg.enabled ? 'checked' : ''}> เปิดใช้งานการแจ้งเตือน
        </label>
      </div>
      <div class="field full">
        <label>Bot Token</label>
        <input class="input" id="tg-token" type="password" value="${esc(cfg.botToken)}" placeholder="เช่น 1234567890:ABCdefGHIjklMNOpqrStUvWxYz">
        <span class="muted small">สร้าง Bot ได้จาก @BotFather ใน Telegram</span>
      </div>
      <div class="field full">
        <label>Chat ID</label>
        <input class="input" id="tg-chatid" value="${esc(cfg.chatId)}" placeholder="เช่น 123456789">
        <span class="muted small">ดู Chat ID ได้จาก @userinfobot หรือ @getidsbot ใน Telegram</span>
      </div>
    </form>
    <div style="display:flex;gap:10px;margin-top:10px">
      <button class="btn btn-primary" onclick="App.saveTelegramConfig()">${icon('check', 16)} บันทึก</button>
      <button class="btn btn-outline" onclick="App.testTelegram()">${icon('send', 16)} ทดสอบส่งข้อความ</button>
      <button class="btn btn-soft" onclick="App.sendDailySummary()">${icon('chart', 16)} ส่งสรุปยอด</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div><h3>การแจ้งเตือนอัตโนมัติ</h3>
      <p class="muted small">ระบบจะส่งแจ้งเตือนอัตโนมัติเมื่อเกิดเหตุการณ์ต่างๆ</p></div></div>
    <div class="table-wrap">
      <table class="list">
        <thead><tr><th>เหตุการณ์</th><th>รายละเอียด</th><th>สถานะ</th></tr></thead>
        <tbody>
          <tr><td>📦 รับเข้าวัสดุ</td><td>แจ้งเตือนเมื่อบันทึกรับเข้า</td><td>${cfg.enabled ? '<span class="badge badge-success">เปิดใช้งาน</span>' : '<span class="badge badge-gray">ปิดอยู่</span>'}</td></tr>
          <tr><td>📤 จำหน่าย/เบิกวัสดุ</td><td>แจ้งเตือนเมื่อบันทึกจำหน่าย</td><td>${cfg.enabled ? '<span class="badge badge-success">เปิดใช้งาน</span>' : '<span class="badge badge-gray">ปิดอยู่</span>'}</td></tr>
          <tr><td>⚠️ วัสดุใกล้หมด</td><td>แจ้งเตือนเมื่อมีวัสดุต่ำกว่าขั้นต่ำ</td><td>${cfg.enabled ? '<span class="badge badge-success">เปิดใช้งาน</span>' : '<span class="badge badge-gray">ปิดอยู่</span>'}</td></tr>
          <tr><td>📊 สรุปยอดรายวัน</td><td>กดส่งด้วยตนเองจากปุ่มด้านบน</td><td>${cfg.enabled ? '<span class="badge badge-success">พร้อมใช้งาน</span>' : '<span class="badge badge-gray">ปิดอยู่</span>'}</td></tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

App.saveTelegramConfig = function () {
  const cfg = {
    enabled: document.getElementById('tg-enabled').checked,
    botToken: document.getElementById('tg-token').value.trim(),
    chatId: document.getElementById('tg-chatid').value.trim(),
  };
  Telegram.saveConfig(cfg);
  toast('บันทึกการตั้งค่าเรียบร้อย', 'success');
  route();
};

App.testTelegram = async function () {
  const cfg = Telegram.getConfig();
  if (!cfg.botToken || !cfg.chatId) { toast('กรุณากรอก Bot Token และ Chat ID ก่อน', 'error'); return; }
  Telegram.saveConfig({ ...cfg, enabled: true });
  const result = await Telegram.sendMessage('✅ <b>ทดสอบการเชื่อมต่อ</b>\nระบบ IT Stock แจ้งเตือนพร้อมใช้งานแล้ว');
  if (result && result.ok) {
    toast('ส่งข้อความทดสอบสำเร็จ! ตรวจสอบใน Telegram', 'success');
  } else {
    toast('ส่งไม่สำเร็จ กรุณาตรวจสอบ Bot Token และ Chat ID', 'error');
  }
};

App.sendDailySummary = async function () {
  const cfg = Telegram.getConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) { toast('กรุณาเปิดใช้งานและตั้งค่า Telegram ก่อน', 'error'); return; }
  await Telegram.notifyDailySummary();
  toast('ส่งสรุปยอดเรียบร้อย', 'success');
};

/* ============================================================
   ตารางเส้นทาง (views)
   ============================================================ */
const Views = {
  dashboard: { title: 'หน้าหลัก', sub: 'ภาพรวมคลังวัสดุและอุปกรณ์', render: renderDashboard },
  receive: {
    title: 'รับเข้าวัสดุ', sub: 'บันทึกวัสดุที่รับเข้าคลัง',
    render: () => renderTxForm('receive') + renderTxHistory('receive'),
    init: () => App.addTxRow('receive'),
  },
  issue: {
    title: 'จำหน่าย / เบิกจ่าย', sub: 'บันทึกการจำหน่ายหรือเบิกวัสดุออกจากคลัง',
    render: () => renderTxForm('issue') + renderTxHistory('issue'),
    init: () => App.addTxRow('issue'),
  },
  departments: { title: 'กลุ่มงาน', sub: 'ภารกิจและกลุ่มงานทั้งหมด', render: renderDepartments },
  stock: { title: 'คงเหลือ', sub: 'ยอดคงเหลือปัจจุบันของวัสดุทั้งหมด', render: renderStock, init: (params) => App.filterStock(params) },
  reports: { title: 'รายงาน', sub: 'ออกรายงานและส่งออกเป็น Excel / PDF', render: renderReports, init: renderReportPreview },
  users: { title: 'ผู้ใช้งาน', sub: 'จัดการบัญชีและสิทธิ์การใช้งาน', render: renderUsers },
  settings: { title: 'ตั้งค่า', sub: 'ตั้งค่าระบบแจ้งเตือนและการเชื่อมต่อ', render: renderSettings },
};
