'use strict';

/* ============================================================
   Views — เรนเดอร์แต่ละหน้า + ตัวจัดการเหตุการณ์ (App.*)
   ============================================================ */

const isAdmin = () => (Auth.current() || {}).role === 'admin';
const isMainAdmin = () => (Auth.current() || {}).username === 'Admin001';

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
  const isStockEdit = (t) => t.party === 'แก้ไขสต็อก' || t.party === 'แก้ไขจำนวนตรง';
  const rcvMonth = txs.filter(t => t.type === 'receive' && !isStockEdit(t) && t.date.slice(0, 7) === mKey).reduce((s, t) => s + qtyIn(t), 0);
  const issMonth = txs.filter(t => t.type === 'issue' && !isStockEdit(t) && t.date.slice(0, 7) === mKey).reduce((s, t) => s + qtyIn(t), 0);

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
      rcv: txs.filter(t => t.type === 'receive' && !isStockEdit(t) && t.date.slice(0, 7) === key).reduce((s, t) => s + qtyIn(t), 0),
      iss: txs.filter(t => t.type === 'issue' && !isStockEdit(t) && t.date.slice(0, 7) === key).reduce((s, t) => s + qtyIn(t), 0),
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
      <input class="input tx-barcode" type="text" placeholder="พิมพ์รหัสบาร์โค้ด" oninput="App.onBarcodeInput(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();App.searchByBarcode(this);}">
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
  const pfx = type === 'receive' ? 'rv' : 'is';
  const c = type === 'receive' ? 'receive' : 'issue';
  const rows = document.getElementById(c + '-rows');
  if (rows) rows.innerHTML = '';
  App.addTxRow(type);
  const d = document.getElementById(pfx + '-date');
  const party = document.getElementById(pfx + '-party');
  const n = document.getElementById(pfx + '-note');
  if (d) d.value = todayStr();
  if (party) party.value = '';
  const rx = document.getElementById(pfx + '-receiver');
  if (rx) rx.value = '';
  if (n) n.value = '';
  /* ล้าง mission / group / unit */
  const mSel = document.getElementById(pfx + '-mission');
  const gSel = document.getElementById(pfx + '-group');
  if (mSel) mSel.value = '';
  if (gSel) gSel.innerHTML = '<option value="">— เลือกกลุ่มงาน —</option>';
  const gc = document.getElementById(pfx + '-group-custom');
  if (gc) gc.classList.add('hidden');
  const uw = document.getElementById(pfx + '-unit-wrap');
  if (uw) uw.classList.add('hidden');
};

App.onMissionChange = function (prefix) {
  const p = prefix || 'is';
  const missionId = $(`#${p}-mission`).value;
  const groupSelect = $(`#${p}-group`);
  const groups = getMissionGroups(missionId);
  groupSelect.innerHTML = '<option value="">— เลือกกลุ่มงาน —</option>' +
    groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('') +
    '<option value="other">... พิมพ์เอง</option>';
  document.getElementById(`${p}-group-custom`).classList.add('hidden');
  /* ล้าง unit dropdown */
  const unitWrap = document.getElementById(`${p}-unit-wrap`);
  if (unitWrap) unitWrap.classList.add('hidden');
};

App.onGroupChange = function (prefix) {
  const p = prefix || 'is';
  const groupId = $(`#${p}-group`).value;
  const unitWrap = document.getElementById(`${p}-unit-wrap`);
  const unitSelect = $(`#${p}-unit`);
  const customWrap = document.getElementById(`${p}-group-custom`);
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
  let receiver = $('#rv-receiver') ? $('#rv-receiver').value : '';
  if (receiver === 'other') {
    receiver = $('#rv-receiver-custom') ? $('#rv-receiver-custom').value.trim() : '';
  }
  const note = $('#rv-note').value.trim();
  const lines = collectTxLines('receive');
  if (!lines) return;
  const tx = { id: uid('tx'), type: 'receive', no: Store.nextTxNo('receive'), date, party, receiver, note, by: me.id, byName: me.name, items: lines };
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
  let receiver = $('#is-receiver') ? $('#is-receiver').value : '';
  if (receiver === 'other') receiver = $('#is-receiver-custom') ? $('#is-receiver-custom').value.trim() : '';
  else receiver = receiver.trim();
  let partyRx = $('#is-party-rx') ? $('#is-party-rx').value.trim() : '';
  const party = receiver || partyRx || unitVal || groupName || missionName;
  const note = $('#is-note').value.trim();
  if (!missionId) { toast('กรุณาเลือกภารกิจ', 'error'); return; }
  if (!groupId && !groupName) { toast('กรุณาเลือกกลุ่มงาน', 'error'); return; }
  const lines = collectTxLines('issue');
  if (!lines) return;
  const tx = { id: uid('tx'), type: 'issue', no: Store.nextTxNo('issue'), date, party, receiver, partyRx, note, by: me.id, byName: me.name, items: lines, mission: missionId, group: groupId === 'other' ? '' : groupId, workUnit: unitVal };
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

function isStockEditTx(t) { return t.party === 'แก้ไขสต็อก' || t.party === 'แก้ไขจำนวนตรง'; }

function txRowHtml(t) {
  const type = t.type;
  const value = fmtQty(t.items.reduce((s, l) => s + l.qty, 0)) + ' ชิ้น';
  const isSE = isStockEditTx(t);
  const stockEditClass = isSE ? ' tx-stock-edit' : '';
  return `<tr class="clickable${stockEditClass}" onclick="App.toggleTxDetail('${t.id}')">
    <td class="td-mono">${esc(t.no)}</td>
    <td>${fmtDate(t.date)}</td>
    <td>${esc(t.party)}${t.type === 'receive' && t.receiver ? `<br><span class="muted small">ผู้บันทึก: ${esc(t.receiver)}</span>` : ''}</td>
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
      ${t.type === 'receive' && t.receiver ? `<div class="tx-note">ผู้บันทึกข้อมูลรับเข้า: ${esc(t.receiver)}</div>` : ''}
      ${t.type === 'issue' && t.receiver ? `<div class="tx-note">ผู้เบิก: ${esc(t.receiver)}</div>` : ''}
      ${t.type === 'issue' && t.partyRx ? `<div class="tx-note">ผู้รับ: ${esc(t.partyRx)}</div>` : ''}
      ${t.workUnit ? `<div class="tx-note">งาน: ${esc(t.workUnit)}</div>` : ''}
      ${t.note ? `<div class="tx-note">หมายเหตุ: ${esc(t.note)}</div>` : ''}
    </div>
  </td></tr>`;
}

function renderTxHistory(type, opts = {}) {
  const showStockEdits = !!opts.stockEdits;
  const allOfType = Store.transactions().filter(t => t.type === type);
  const txs = allOfType.filter(t => isStockEditTx(t) === showStockEdits);
  const seCount = allOfType.filter(isStockEditTx).length;
  const normalCount = allOfType.length - seCount;
  const title = type === 'receive' ? 'ประวัติรับเข้าวัสดุ' : 'ประวัติจำหน่าย / เบิกจ่าย';
  const partyCol = type === 'receive' ? 'ผู้ส่งมอบ / ผู้บันทึก' : 'ผู้เบิก / หน่วยงาน';
  const allGroups = MISSIONS.flatMap(m => m.groups.map(g => ({ id: g.id, name: g.name, mission: m.name })));
  const deptOptions = allGroups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  const rows = txs.map(txRowHtml).join('');
  const baseHash = type === 'receive' ? '#/receive' : '#/issue';

  /* แท็บแยกรายการผู้เบิกออก กับ รายการแก้ไขสต๊อก */
  const tabs = `
    <div class="tx-tabs">
      <a class="tx-tab${showStockEdits ? '' : ' active'}" href="${baseHash}">
        ${icon(type === 'receive' ? 'receive' : 'issue', 15)} <span>${type === 'receive' ? 'รับเข้าปกติ' : 'ผู้เบิกออก'}</span>
        <span class="tx-tab-count">${fmtQty(normalCount)}</span>
      </a>
      <a class="tx-tab${showStockEdits ? ' active' : ''}" href="${baseHash}?tab=stockedits">
        ${icon('edit', 15)} <span>แก้ไขสต๊อก</span>
        <span class="tx-tab-count">${fmtQty(seCount)}</span>
      </a>
    </div>`;

  return `
  <div class="card">
    <div class="card-head"><div><h3>${title}</h3><p class="muted small">คลิกแถวเพื่อดูรายละเอียดรายการ</p></div>
      <div style="display:flex;gap:8px;align-items:center;">
        ${type === 'issue' ? `<select class="input" id="tx-dept-filter" style="width:180px" onchange="App.filterTx('${type}')">
          <option value="">ทุกกลุ่มงาน</option>
          ${deptOptions}
        </select>` : ''}
        ${showStockEdits && isMainAdmin() ? `<button class="btn btn-ghost danger" onclick="App.purgeStockEdits()" title="ลบรายการแก้ไขสต๊อกทั้งหมด">${icon('trash', 16)} ลบรายการแก้ไขสต๊อกทั้งหมด</button>` : ''}
        <div class="search-box">${icon('search', 16)}<input class="input" id="tx-search" placeholder="ค้นหาเลขที่ / ฝ่าย..." oninput="App.filterTx('${type}')"></div>
      </div>
    </div>
    ${tabs}
    <div class="table-wrap">
      <table class="list"><thead><tr>
        <th>เลขที่</th><th>วันที่</th><th>${partyCol}</th><th>รายการ</th><th class="num">จำนวนรวม</th><th>ผู้บันทึก</th><th></th>
      </tr></thead>
      <tbody id="tx-body-${type}" data-stock-edits="${showStockEdits ? 1 : 0}">${rows || '<tr><td colspan="7"><div class="empty">' + icon('box', 34) + '<span>ยังไม่มีรายการ</span></div></td></tr>'}</tbody></table>
    </div>
  </div>`;
}

App.filterTx = function (type) {
  const q = ($('#tx-search').value || '').toLowerCase();
  const groupFilter = $('#tx-dept-filter') ? $('#tx-dept-filter').value : '';
  const body = $('#tx-body-' + type);
  if (!body) return;
  const stockEdits = body.dataset.stockEdits === '1';
  const txs = Store.transactions().filter(t => t.type === type && isStockEditTx(t) === stockEdits);
  const rows = txs.filter(t =>
    (!q || t.no.toLowerCase().includes(q) || t.party.toLowerCase().includes(q) || (t.receiver && t.receiver.toLowerCase().includes(q)) || t.items.some(l => l.name.toLowerCase().includes(q))) &&
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

App.purgeStockEdits = function () {
  const seCount = Store.transactions().filter(t => t.party === 'แก้ไขสต็อก' || t.party === 'แก้ไขจำนวนตรง').length;
  if (!seCount) { toast('ไม่มีรายการแก้ไขสต็อกที่ต้องลบ', 'info'); return; }
  if (typeof confirmAction === 'function') {
    confirmAction('ลบรายการแก้ไขสต็อกทั้งหมด', `ต้องการลบรายการแก้ไขสต็อก <strong>${seCount}</strong> รายการ ใช่หรือไม่?<br><small style='color:#ef4444'>⚠️ จำนวนคงเหลือจะถูกคำนวณใหม่จากรายการรับ/เบิกที่เหลือ</small>`, () => {
      const count = Store.deleteStockEditTransactions();
      toast(`ลบรายการแก้ไขสต็อก ${count} รายการ เรียบร้อย`, 'success');
      route();
    }, 'ลบรายการ');
  } else {
    if (!confirm(`ต้องการลบรายการแก้ไขสต็อก ${seCount} รายการ ใช่หรือไม่?`)) return;
    const count = Store.deleteStockEditTransactions();
    toast(`ลบรายการแก้ไขสต็อก ${count} รายการ เรียบร้อย`, 'success');
    route();
  }
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
  if (!t) { toast('ไม่พบรายการนี้', 'error'); return; }
  if (typeof confirmAction === 'function') {
    confirmAction('ลบรายการ', `ต้องการลบเอกสาร <strong>${esc(t.no)}</strong> ใช่หรือไม่?<br><small style='color:#ef4444'>⚠️ การลบจะคืนจำนวนคงเหลืออัตโนมัติ</small>`, () => {
      Store.deleteTransaction(id);
      toast('ลบรายการ ' + t.no + ' เรียบร้อย', 'success');
      route();
    }, 'ลบรายการ');
  } else {
    if (!confirm('ต้องการลบเอกสาร ' + t.no + ' ใช่หรือไม่?')) return;
    Store.deleteTransaction(id);
    toast('ลบรายการ ' + t.no + ' เรียบร้อย', 'success');
    route();
  }
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
          ? `<div class="field"><label>บันทึกข้อมูล *</label>
              <input id="${idP}-party" class="input" placeholder="เช่น ชื่อผู้ส่งมอบ, ร้านค้า" required></div>`
          : `<div class="field"><label>ภารกิจ *</label>
              <select id="${idP}-mission" class="input" required onchange="App.onMissionChange('${idP}')">
                <option value="">— เลือกภารกิจ —</option>
                ${missionOptions}
              </select></div>
            <div class="field"><label>กลุ่มงาน *</label>
              <select id="${idP}-group" class="input" required onchange="App.onGroupChange('${idP}')">
                <option value="">— เลือกกลุ่มงาน —</option>
              </select>
              <input id="${idP}-group-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่อกลุ่มงาน">
            </div>
            <div class="field hidden" id="${idP}-unit-wrap"><label>งาน</label>
              <select id="${idP}-unit" class="input" onchange="document.getElementById('${idP}-unit-custom').classList.toggle('hidden', this.value !== 'other')">
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
      ${isRcv 
        ? `<div class="field"><label>บันทึกข้อมูลรับเข้าวัสดุ *</label>
            <select id="${idP}-receiver" class="input" required onchange="document.getElementById('${idP}-receiver-custom').classList.toggle('hidden', this.value !== 'other')">
              <option value="">— เลือกผู้บันทึก —</option>
              <option value="นายพีรพัฒน์ ชัยวัฒน์ทวี">นายพีรพัฒน์ ชัยวัฒน์ทวี</option>
              <option value="other">... พิมพ์เอง</option>
            </select>
            <input id="${idP}-receiver-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่อผู้บันทึกข้อมูลรับเข้า">
          </div>`
        : `<div class="field"><label>ผู้เบิก *</label>
            <select id="${idP}-receiver" class="input" required onchange="document.getElementById('${idP}-receiver-custom').classList.toggle('hidden', this.value !== 'other')">
              <option value="">— เลือกผู้เบิก —</option>
              <option value="นายพีรพัฒน์ ชัยวัฒน์ทวี">นายพีรพัฒน์ ชัยวัฒน์ทวี</option>
              <option value="นายชวนากร เงินใส">นายชวนากร เงินใส</option>
              <option value="นายนิรุชา ทรัพย์สุวาณิชย์">นายนิรุชา ทรัพย์สุวาณิชย์</option>
              <option value="other">... พิมพ์เอง</option>
            </select>
            <input id="${idP}-receiver-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่อผู้เบิก">
          </div>
          <div class="field" style="position:relative"><label>ผู้รับ *</label>
            <input id="${idP}-party-rx" class="input" required placeholder="พิมพ์ชื่อผู้รับ..." autocomplete="off" oninput="App.filterReceiver(this, '${idP}')" onfocus="App.filterReceiver(this, '${idP}')" onblur="setTimeout(()=>document.getElementById('${idP}-rx-list').style.display='none',200)">
            <div id="${idP}-rx-list" class="rx-suggest"></div>
          </div>`}
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
      <div class="search-box">${icon('search', 16)}<input class="input" id="st-search" placeholder="ค้นหา หรือสแกนบาร์โค้ด..." oninput="App.onStockSearchInput(this)" onkeydown="App.scanEnter(event)"></div>
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
  if (!it) {
    toast(`ไม่พบวัสดุ รหัส "${esc(code)}"`, 'error');
    /* ล้างค่าอัตโนมัติแล้ว focus กลับมาช่องค้นหา */
    if (search) { setTimeout(() => { search.value = ''; search.focus(); }, 300); }
    return;
  }
  const row = document.querySelector('#st-body tr[data-id="' + it.id + '"]');
  if (row) {
    row.classList.remove('row-flash');
    void row.offsetWidth; /* รีสตาร์ทแอนิเมชัน */
    row.classList.add('row-flash');
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => row.classList.remove('row-flash'), 3400);
  }
  toast(`พบวัสดุ: ${it.name} (${it.code})`);
  /* ล้างค่าอัตโนมัติแล้ว focus กลับมาช่องค้นหาสำหรับสแกนต่อ */
  if (search) { setTimeout(() => { search.value = ''; search.focus(); }, 500); }
}

App.scanEnter = function (ev) {
  if (ev.key === 'Enter') { ev.preventDefault(); handleScanResult(ev.target.value); }
};

/* auto-detect USB barcode scanner ในหน้าคงเหลือ */
App._stockScanTimer = null;
App.onStockSearchInput = function (el) {
  App.filterStock();
  if (App._stockScanTimer) clearTimeout(App._stockScanTimer);
  /* อ่านค่า ณ เวลาที่ timer ทำงาน — ป้องกันค่าค้างจาก scanner */
  App._stockScanTimer = setTimeout(() => {
    const val = (el.value || '').trim();
    if (val.length >= 8) handleScanResult(val);
  }, 300);
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

/* ค้นหาวัสดุด้วยรหัสบาร์โค้ด (พิมพ์เอง) */
/* ตรวจจับ barcode scanner ด้วย debounce — ล้างค่าเก่าอัตโนมัติ */
App._barcodeTimers = {};
App.onBarcodeInput = function (inputEl) {
  const row = inputEl.closest('.tx-row');
  const rowId = row ? (row.dataset.id || 'row0') : 'row0';
  // ล้าง timer เดิม
  if (App._barcodeTimers[rowId]) clearTimeout(App._barcodeTimers[rowId]);
  // ถ้า input ยาว ≥8 ตัวอักษร (ดูเหมือนบาร์โค้ด) ให้รอ 300ms แล้วประมวลผล
  const val = (inputEl.value || '').trim();
  if (val.length >= 8) {
    App._barcodeTimers[rowId] = setTimeout(() => {
      App.searchByBarcode(inputEl);
    }, 300);
  }
};

App.searchByBarcode = function (inputEl) {
  const code = (inputEl.value || '').trim();
  if (!code) return;
  const row = inputEl.closest('.tx-row');
  const select = row.querySelector('.tx-item');
  const it = Store.items().find(i => i.code.toUpperCase() === code.toUpperCase() || i.id === code);
  if (!it) {
    toast(`ไม่พบรหัสวัสดุ "${esc(code)}"`, 'error');
    inputEl.value = '';
    inputEl.focus();
    return;
  }
  select.value = it.id;
  App.onTxItemChange(select);
  inputEl.value = '';
  inputEl.focus();
  toast(`พบวัสดุ: ${it.name} (${it.code})`, 'success');
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
  
  // แสดงสถานะการสแกน
  el.innerHTML = '<div style="text-align:center;padding:10px;"><span style="color:#22c55e;">📷 กำลังเปิดกล้อง...</span></div>';
  
  window.__scanner.start(
    { facingMode: 'environment' },
    {
      fps: 15,
      qrbox: { width: 300, height: 150 },
      aspectRatio: 1.5,
      disableFlip: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
      ]
    },
    text => {
      App.stopScanner();
      closeModal();
      const code = String(text || '').trim();
      if (!code) return;
      const it = Store.items().find(i => i.code.toUpperCase() === code.toUpperCase() || i.id === code);
      if (!it) { toast(`ไม่พบรหัสวัสดุ "${esc(code)}"`, 'error'); return; }
      selectEl.value = it.id;
      App.onTxItemChange(selectEl);
      // ล้างและ focus กลับไปช่องบาร์โค้ด
      const row = selectEl.closest('.tx-row');
      if (row) {
        const barcodeInput = row.querySelector('.tx-barcode');
        if (barcodeInput) { barcodeInput.value = ''; barcodeInput.focus(); }
      }
      toast(`พบวัสดุ: ${it.name} (${it.code})`);
    },
    () => {}
  ).catch(err => {
    console.error('Scanner error:', err);
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
  
  // แสดงสถานะการสแกน
  el.innerHTML = '<div style="text-align:center;padding:10px;"><span style="color:#22c55e;">📷 กำลังเปิดกล้อง...</span></div>';
  
  window.__scanner.start(
    { facingMode: 'environment' },
    {
      fps: 15,
      qrbox: { width: 300, height: 150 },
      aspectRatio: 1.5,
      disableFlip: false,
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
      ]
    },
    text => { App.stopScanner(); closeModal(); handleScanResult(text); },
    () => { /* ข้าม error รายเฟรม */ }
  ).catch(err => {
    console.error('Scanner error:', err);
    window.__scanner = null;
    el.innerHTML = `<div class="empty">${icon('alert', 30)}<span>เปิดกล้องไม่สำเร็จ<br>ตรวจสอบสิทธิ์การใช้งานกล้อง หรือใช้เครื่องสแกนบาร์โค้ดแทน</span></div>`;
  });
}

App.editStockQty = function (id, td) {
  if (!isMainAdmin()) return;
  const item = Store.getItem(id);
  if (!item) return;
  /* ดึง qty จริงจาก getStock() */
  const stockMap = {};
  Store.getStock().forEach(s => { stockMap[s.id] = s.qty; });
  const currentQty = stockMap[id] || 0;
  td.innerHTML = `<input class="input" type="number" min="0" step="1" value="${currentQty}" style="width:80px;display:inline-block" onkeydown="if(event.key==='Enter')App.saveStockQty('${id}',this)" onblur="App.saveStockQty('${id}',this)">`;
  td.querySelector('input').focus();
  td.querySelector('input').select();
};

App.saveStockQty = function (id, input) {
  const newQty = Number(input.value);
  if (isNaN(newQty) || newQty < 0) { App.filterStock(); return; }
  const item = Store.getItem(id);
  if (!item) return;
  /* ดึง qty จริงจาก getStock() เพราะ item.qty ไม่มีใน object ดิบ */
  const stockMap = {};
  Store.getStock().forEach(s => { stockMap[s.id] = s.qty; });
  const oldQty = stockMap[id] || 0;
  if (newQty === oldQty) { App.filterStock(); return; }
  const diff = newQty - oldQty;
  const type = diff > 0 ? 'receive' : 'issue';
  const absDiff = Math.abs(diff);
  Store.addTransaction({
    type,
    no: Store.nextTxNo(type),
    date: todayStr(),
    party: 'แก้ไขสต็อก',
    receiver: '',
    partyRx: '',
    note: `แก้ไขจำนวนจาก ${fmtQty(oldQty)} เป็น ${fmtQty(newQty)} (${diff > 0 ? '+' : ''}${diff})`,
    mission: item.mission || '',
    group: item.group || '',
    workUnit: item.workUnit || '',
    items: [{ itemId: id, name: item.name, qty: absDiff, serials: [] }],
  });
  toast(`แก้ไขจำนวน ${item.name} จาก ${fmtQty(oldQty)} เป็น ${fmtQty(newQty)} ${item.unit} เรียบร้อย`, 'success');
  App.filterStock();
};

App.setQtyDirect = function (id) {
  if (!isMainAdmin()) return;
  const item = Store.getItem(id);
  if (!item) return;
  const stockMap = {};
  Store.getStock().forEach(s => { stockMap[s.id] = s.qty; });
  const currentQty = stockMap[id] || 0;
  openModal(modalShell('ตั้งจำนวนตรง — ' + item.name,
    `<div class="form-grid">
      <p class="muted small">จำนวนปัจจุบัน: <strong>${fmtQty(currentQty)} ${esc(item.unit)}</strong></p>
      <p class="muted small" style="color:#e53935">⚠️ การตั้งจำนวนตรงจะลบรายการรับ/เบิกเดิมของวัสดุนี้ แล้วสร้างรายการรับใหม่ด้วยจำนวนที่กำหนด</p>
      <div class="field"><label>จำนวนใหม่ *</label>
        <input class="input" id="sqd-qty" type="number" min="0" step="1" value="${currentQty}" required></div>
    </div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-primary" onclick="App.saveQtyDirect('${id}')">${icon('check', 16)} บันทึก</button>`));
};

App.saveQtyDirect = function (id) {
  const newQty = Number($('#sqd-qty').value);
  if (isNaN(newQty) || newQty < 0) { toast('กรุณากรอกจำนวนที่ถูกต้อง', 'error'); return; }
  const item = Store.getItem(id);
  if (!item) return;
  Store.setQtyDirect(id, newQty);
  toast(`ตั้งจำนวน ${item.name} เป็น ${fmtQty(newQty)} ${item.unit} เรียบร้อย`, 'success');
  closeModal();
  App.filterStock();
};

/* ===== Autocomplete ผู้รับ ===== */
App.filterReceiver = function (el, prefix) {
  const q = el.value.trim().toLowerCase();
  const list = document.getElementById(prefix + '-rx-list');
  if (!list) return;
  if (!q || q.length < 1) { list.style.display = 'none'; return; }
  const names = (typeof RECEIVER_NAMES !== 'undefined') ? RECEIVER_NAMES : [];
  const matches = names.filter(n => n.toLowerCase().includes(q)).slice(0, 10);
  if (!matches.length) { list.style.display = 'none'; return; }
  list.innerHTML = matches.map(n => `<div class="rx-item" onmousedown="document.getElementById('${prefix}-party-rx').value='${esc(n)}';document.getElementById('${prefix}-rx-list').style.display='none'">${esc(n)}</div>`).join('');
  list.style.display = 'block';
};

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
      <td class="td-item-name">${s.image ? `<img class="item-thumb" src="${esc(s.image)}" alt="">` : ''}<div><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.location) || '—'}</div></div></td>
      <td><span class="chip-cat">${esc(s.category)}</span></td>
      <td>${esc(s.unit)}</td>
      <td class="num" ${isMainAdmin() ? `onclick="App.editStockQty('${s.id}', this)" style="cursor:pointer" title="คลิกเพื่อแก้ไขจำนวน"` : ''}><strong>${fmtQty(s.qty)}</strong> ${s.status === 'out' ? '<span class="muted small">(หมด)</span>' : ''}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="actions">
        ${s.trackSerial ? `<button class="btn-icon" onclick="App.viewSerials('${s.id}')" title="ดู Serial ในคลัง">${icon('hash', 16)}</button>` : ''}
        ${isMainAdmin() ? `<button class="btn-icon" onclick="App.setQtyDirect('${s.id}')" title="ตั้งจำนวนตรง (ไม่สร้างรายการ)">${icon('settings', 16)}</button>` : ''}
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
  const catOptions = cats.map(c => `<option value="${esc(c)}" ${item && item.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const missionOptions = MISSIONS.map(m => `<option value="${m.id}" ${item && item.mission === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const selectedMission = item ? item.mission : '';
  const selectedGroup = item ? item.group : '';
  const groups = selectedMission ? getMissionGroups(selectedMission) : [];
  const groupOptions = groups.map(g => `<option value="${g.id}" ${selectedGroup === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  openModal(modalShell(isEdit ? 'แก้ไขวัสดุ' : 'เพิ่มวัสดุใหม่',
    `<form id="item-form" class="form-grid" onsubmit="return false">
      <div class="field"><label>รหัสวัสดุ</label>
        ${isEdit 
          ? (isMainAdmin()
            ? `<input class="input" id="if-code" value="${esc(item.code)}" placeholder="รหัสบาร์โค้ด">`
            : `<input class="input" value="${esc(item.code)}" disabled>`) 
          : `<input class="input" id="if-code" value="" placeholder="พิมพ์หรือสแกนบาร์โค้ด" oninput="document.getElementById('if-auto-code').checked = this.value.trim() === ''">
            <label class="check mt-1"><input type="checkbox" id="if-auto-code" checked onchange="if(this.checked){document.getElementById('if-code').value=''}"> สร้างอัตโนมัติ (ไม่มีบาร์โค้ด)</label>`}
      </div>
      <div class="field"><label>ชื่อวัสดุ *</label><input class="input" id="if-name" value="${esc(item ? item.name : '')}" placeholder="เช่น เมาส์ไร้สาย Logitech" required></div>
      <div class="field"><label>หมวดหมู่ *</label>
        <select class="input" id="if-cat" required>
          <option value="">— เลือกหมวดหมู่ —</option>
          ${catOptions}
          <option value="__new__">+ เพิ่มหมวดหมู่ใหม่...</option>
        </select>
        <input class="input mt-2 hidden" id="if-cat-new" placeholder="พิมพ์ชื่อหมวดหมู่ใหม่" oninput="document.getElementById('if-cat').value='__new__'">
        <script>document.getElementById('if-cat').addEventListener('change',function(){document.getElementById('if-cat-new').classList.toggle('hidden',this.value!=='__new__');if(this.value!=='__new__')document.getElementById('if-cat-new').value=''});</script>
      </div>

      <div class="field"><label>หน่วยนับ *</label><input class="input" id="if-unit" value="${esc(item ? item.unit : '')}" placeholder="ตัว / เครื่อง / เส้น" required></div>

      <div class="field"><label>จำนวนขั้นต่ำ (เตือนเมื่อใกล้หมด)</label><input class="input" id="if-min" type="number" min="0" step="1" value="${item ? item.minStock : 0}"></div>
      <div class="field full"><label class="check"><input type="checkbox" id="if-serial" ${item && item.trackSerial ? 'checked' : ''}> ติดตามเป็นรายชิ้น (Serial Number / Inventory Tag)</label>
        <span class="muted small">สำหรับวัสดุราคาสูง เช่น โน้ตบุ๊ก เครื่องพิมพ์ — ต้องระบุ Serial ทุกครั้งที่รับเข้า / จำหน่าย</span></div>
      <div class="field full"><label>สถานที่จัดเก็บ</label><input class="input" id="if-loc" value="${esc(item ? item.location : '')}" placeholder="เช่น ห้องพัสดุ ชั้น A"></div>
      <div class="field full"><label>หมายเหตุ</label><input class="input" id="if-note" value="${esc(item ? item.note : '')}"></div>
      <div class="field full"><label>รูปภาพวัสดุ</label>
        <div class="item-image-wrap" id="if-image-wrap">
          ${item && item.image ? `<div class="item-image-preview"><img src="${esc(item.image)}" alt="รูปวัสดุ"><button type="button" class="btn-icon danger" onclick="App.clearItemImage()" title="ลบรูป">${icon('trash', 14)}</button></div>` : ''}
          <div class="item-image-actions">
            <label class="btn btn-outline btn-sm" style="cursor:pointer">${icon('camera', 14)} ถ่ายรูป / เลือกรูป
              <input type="file" id="if-image" accept="image/*" capture="environment" class="hidden" onchange="App.previewItemImage(this)"></label>
            <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('if-image').click()" title="เลือกไฟล์รูป">${icon('box', 14)} เลือกไฟล์</button>
          </div>
        </div>
        <span class="muted small">รองรับ JPG, PNG — ขนาดไม่เกิน 500 KB</span>
      </div>
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

App.previewItemImage = function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { toast('ไฟล์รูปภาพมีขนาดเกิน 500 KB', 'error'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const wrap = document.getElementById('if-image-wrap');
    if (!wrap) return;
    /* ลบ preview เดิมถ้ามี */
    const old = wrap.querySelector('.item-image-preview');
    if (old) old.remove();
    const div = document.createElement('div');
    div.className = 'item-image-preview';
    div.innerHTML = `<img src="${e.target.result}" alt="รูปวัสดุ"><button type="button" class="btn-icon danger" onclick="App.clearItemImage()" title="ลบรูป">${icon('trash', 14)}</button>`;
    wrap.prepend(div);
  };
  reader.readAsDataURL(file);
};

App.clearItemImage = function () {
  const wrap = document.getElementById('if-image-wrap');
  const preview = wrap && wrap.querySelector('.item-image-preview');
  if (preview) preview.remove();
  const input = document.getElementById('if-image');
  if (input) input.value = '';
};

App.saveItem = function (id) {
  const name = $('#if-name').value.trim();
  const catSelect = $('#if-cat').value;
  const category = catSelect === '__new__' ? ($('#if-cat-new') ? $('#if-cat-new').value.trim() : '') : catSelect.trim();
  const unit = $('#if-unit').value.trim();
  if (!name || !category || !unit) { toast('กรุณากรอกชื่อ หมวดหมู่ และหน่วยนับให้ครบ', 'error'); return; }
  /* รหัสวัสดุ: ใช้บาร์โค้ดที่สแกน หรือสร้างอัตโนมัติ */
  let code = '';
  const autoCode = document.getElementById('if-auto-code');
  const codeInput = document.getElementById('if-code');
  if (!id) { /* เพิ่มใหม่เท่านั้น */
    if (autoCode && autoCode.checked) {
      code = ''; /* จะให้ store สร้างให้ */
    } else if (codeInput && codeInput.value.trim()) {
      code = codeInput.value.trim();
    }
  } else if (isMainAdmin() && codeInput && codeInput.value.trim()) {
    /* Admin001 แก้ไขรหัสวัสดุได้ */
    code = codeInput.value.trim();
  }
  const data = {
    name, category, unit,
    mission: '',
    group: '',
    workUnit: '',
    price: 0,
    minStock: Number($('#if-min').value) || 0,
    location: $('#if-loc').value.trim(),
    note: $('#if-note').value.trim(),
    trackSerial: !!document.getElementById('if-serial').checked,
    image: '',
  };
  /* อ่านรูปภาพจาก preview ถ้ามี */
  const imgPreview = document.querySelector('#if-image-wrap .item-image-preview img');
  if (imgPreview) data.image = imgPreview.src;
  /* ถ้าแก้ไขและไม่ได้เปลี่ยนรูป ใช้รูปเดิม */
  if (id && !data.image) {
    const existing = Store.getItem(id);
    if (existing && existing.image) data.image = existing.image;
  }
  if (code) data.code = code;
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
        <button class="seg-btn ${REP.type === 'out' ? 'active' : ''}" onclick="App.setReport('out')">หมดคลัง</button>
        <button class="seg-btn ${REP.type === 'low' ? 'active' : ''}" onclick="App.setReport('low')">ใกล้หมด (≤1)</button>
        <button class="seg-btn ${REP.type === 'receive' ? 'active' : ''}" onclick="App.setReport('receive')">รับเข้า</button>
        <button class="seg-btn ${REP.type === 'issue' ? 'active' : ''}" onclick="App.setReport('issue')">จำหน่าย</button>
      </div>
      <div id="rep-range" class="${['stock','out','low'].includes(REP.type) ? 'hidden' : ''}">
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
  if (['stock','out','low'].includes(type)) {
    let stock = Store.getStock();
    if (type === 'out') stock = stock.filter(s => s.qty <= 0);
    if (type === 'low') stock = stock.filter(s => s.qty > 0 && s.qty <= 1);
    const cols = [
      { label: 'ลำดับ', align: 'right' }, { label: 'รหัสวัสดุ' }, { label: 'รายการวัสดุ' }, { label: 'หมวดหมู่' },
      { label: 'หน่วย' }, { label: 'คงเหลือ', align: 'right' }, { label: 'สถานะ' },
    ];
    const rows = stock.map((s, i) => {
      const status = s.qty <= 0 ? 'หมดคลัง' : s.qty <= 1 ? 'ใกล้หมด' : 'เพียงพอ';
      return [i + 1, s.code, s.name, s.category, s.unit, fmtQty(s.qty), status];
    });
    const totQ = stock.reduce((a, s) => a + s.qty, 0);
    const titles = { stock: 'รายงานคงเหลือวัสดุ', out: 'รายงานวัสดุหมดคลัง', low: 'รายงานวัสดุใกล้หมด (คงเหลือ ≤1)' };
    return {
      title: titles[type] || 'รายงานคงเหลือวัสดุ',
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
  </div>

  <div class="card">
    <div class="card-head"><div><h3>💾 Backup & Restore (สำรองและกู้คืนข้อมูล)</h3>
      <p class="muted small">ดาวน์โหลดไฟล์ backup หรือนำเข้าข้อมูลจากไฟล์ backup</p></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-success" onclick="App.exportBackup()">${icon('download', 16)} ดาวน์โหลด Backup (JSON)</button>
      <button class="btn btn-primary" onclick="App.exportBackupQR()">📱 สร้าง QR Code</button>
      <label class="btn btn-warning" style="cursor:pointer">${icon('upload', 16)} นำเข้า Backup
        <input type="file" accept=".json" style="display:none" onchange="App.importBackup(this)">
      </label>
    </div>
    ${(() => {
      const seCount = Store.transactions().filter(t => t.party === 'แก้ไขสต็อก' || t.party === 'แก้ไขจำนวนตรง').length;
      return seCount > 0 ? `<div style="margin-top:12px;padding:12px;background:#fff3e0;border-radius:8px;border:1px solid #ffcc80">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>⚠️ มีรายการแก้ไขสต็อก <strong>${seCount}</strong> รายการ ที่ทำให้ตัวเลขจำหน่ายบวม</span>
          <button class="btn btn-danger" onclick="App.purgeStockEdits()">${icon('trash', 16)} ลบรายการแก้ไขสต็อกทั้งหมด</button>
        </div>
        <p class="muted small" style="margin-top:5px">ลบ transaction แก้ไขสต็อกออก จำนวนคงเหลือจะถูกคำนวณใหม่จากรายการรับเข้าที่เหลือ</p>
      </div>` : '';
    })()}
    <div class="muted small" style="margin-top:15px;padding:10px;background:var(--bg-secondary);border-radius:8px">
      <strong>💡 วิธีใช้:</strong>
      <ul style="margin:5px 0;padding-left:20px">
        <li><strong>ดาวน์โหลด Backup:</strong> บันทึกข้อมูลทั้งหมดเป็นไฟล์ .json — เก็บไว้ในที่ปลอดภัย</li>
        <li><strong>นำเข้า Backup:</strong> เลือกไฟล์ .json ที่เคย backup ไว้ → ข้อมูลจะถูกกู้คืนทั้งหมด</li>
      </ul>
      <p style="margin-top:8px"><strong>⚠️ ควร backup สม่ำเสมอ</strong> โดยเฉพาะก่อนแก้ไขข้อมูลจำนวนมาก</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><div><h3>☁️ Cloud Backup (สำรองข้อมูลบน Cloudflare)</h3>
      <p class="muted small">สำรองข้อมูลขึ้น Cloudflare — เข้าถึงได้จากทุกที่ ทุกอุปกรณ์</p></div></div>
    ${(() => {
      const cloudKey = localStorage.getItem('it_stock_cloud_backup_key') || '';
      const lastBackup = localStorage.getItem('it_stock_cloud_last_backup');
      return `
    <div style="margin-bottom:15px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      ${cloudKey ? '<span class="badge badge-success">✅ ตั้งค่าแล้ว</span>' : '<span class="badge badge-gray">❌ ยังไม่ได้ตั้งค่า</span>'}
      ${lastBackup ? `<span class="muted small">backup ล่าสุด: ${new Date(parseInt(lastBackup)).toLocaleString('th-TH')}</span>` : ''}
    </div>
    <div class="form-grid">
      <div class="field full">
        <label>🔑 Cloud Key (รหัสสำรองข้อมูล)</label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input class="input" id="cloud-backup-key" type="password" value="${esc(cloudKey)}" placeholder="ใส่รหัสลับสำหรับ backup (min 6 ตัวอักษร)">
          <button type="button" class="btn btn-sm" onclick="const i=document.getElementById('cloud-backup-key');i.type=i.type==='password'?'text':'password'">👁️</button>
        </div>
        <p class="muted small" style="margin-top:5px">ใช้รหัสนี้สำหรับ backup และ restore ข้อมูลจากทุกเครื่อง</p>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
      <button class="btn btn-success" onclick="App.cloudBackup()">☁️ สำรองข้อมูลขึ้น Cloud</button>
      <button class="btn btn-primary" onclick="App.cloudRestore()">📥 กู้คืนข้อมูลจาก Cloud</button>
      <button class="btn btn-outline" onclick="App.cloudCheckBackup()">🔍 ตรวจสอบ Backup</button>
    </div>
    <div class="muted small" style="margin-top:15px;padding:10px;background:var(--bg-secondary);border-radius:8px">
      <strong>💡 วิธีใช้ Cloud Backup:</strong>
      <ol style="margin:5px 0;padding-left:20px">
        <li>ใส่ <strong>Cloud Key</strong> อะไรก็ได้ (เช่น <code>itstock-2026</code>) — ใส่เหมือนกันทุกเครื่อง</li>
        <li>กด <strong>☁️ สำรองข้อมูลขึ้น Cloud</strong> → ข้อมูลจะถูกเก็บบน Cloudflare</li>
        <li>บนเครื่องอื่น → ใส่ Cloud Key เดียวกัน → กด <strong>📥 กู้คืนข้อมูลจาก Cloud</strong></li>
      </ol>
      <p style="margin-top:8px"><strong>⚠️ เก็บ Cloud Key ไว้ที่ปลอดภัย</strong> — ถ้าหายจะกู้ข้อมูลไม่ได้</p>
    </div>
  </div>`;
    })()}
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

/* ============================================================
   Cloud Backup (Cloudflare KV)
   ============================================================ */

const CLOUD_BACKUP_API = 'https://it-stock-backup.itstocksync.workers.dev/api/backup';

App.cloudBackup = async function () {
  const key = document.getElementById('cloud-backup-key').value.trim();
  if (!key || key.length < 6) { toast('Cloud Key ต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
  localStorage.setItem('it_stock_cloud_backup_key', key);

  toast('กำลังสำรองข้อมูลขึ้น Cloud...', 'info');
  try {
    const backupData = {
      items: Store.db.items || [],
      transactions: Store.db.transactions || [],
      users: Store.db.users || [],
      reorderItems: Store.db.reorderItems || [],
      _exportDate: new Date().toISOString(),
    };
    const resp = await fetch(`${CLOUD_BACKUP_API}?key=${encodeURIComponent(key)}`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backupData) }
    );
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const result = await resp.json();
    localStorage.setItem('it_stock_cloud_last_backup', Date.now().toString());
    toast(`☁️ สำรองข้อมูลสำเร็จ! (${result.itemCount} รายการ)`, 'success');
    route();
  } catch (e) {
    toast('สำรองไม่สำเร็จ: ' + e.message, 'error');
  }
};

App.cloudRestore = async function () {
  const key = document.getElementById('cloud-backup-key').value.trim();
  if (!key || key.length < 6) { toast('กรุณาใส่ Cloud Key', 'error'); return; }
  localStorage.setItem('it_stock_cloud_backup_key', key);

  if (!confirm('กู้คืนข้อมูลจาก Cloud?\nข้อมูลปัจจุบันจะถูกแทนที่ทั้งหมด')) return;

  toast('กำลังดึงข้อมูลจาก Cloud...', 'info');
  try {
    const resp = await fetch(`${CLOUD_BACKUP_API}?key=${encodeURIComponent(key)}`);
    if (resp.status === 404) { toast('ไม่พบ backup สำหรับ Cloud Key นี้', 'error'); return; }
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    // ตรวจสอบว่ามีข้อมูลจริง
    if (!data.items || data.items.length === 0) {
      toast('ไม่พบข้อมูลใน backup', 'error');
      return;
    }

    // แทนที่ข้อมูล
    Store.db = {
      items: data.items || [],
      transactions: data.transactions || [],
      users: data.users || Store.db.users || [],
      reorderItems: data.reorderItems || [],
    };
    Store.save();
    toast(`📥 กู้คืนสำเร็จ! (${data.items.length} รายการ)`, 'success');
    route();
  } catch (e) {
    toast('กู้คืนไม่สำเร็จ: ' + e.message, 'error');
  }
};

App.cloudCheckBackup = async function () {
  const key = document.getElementById('cloud-backup-key').value.trim();
  if (!key || key.length < 6) { toast('กรุณาใส่ Cloud Key', 'error'); return; }

  toast('กำลังตรวจสอบ...', 'info');
  try {
    const resp = await fetch(`${CLOUD_BACKUP_API}/list?key=${encodeURIComponent(key)}`);
    const data = await resp.json();
    if (data.exists) {
      const d = new Date(data.backupAt);
      toast(`✅ พบ backup!\nรายการ: ${data.itemCount} รายการ\nธุรกรรม: ${data.transactionCount} รายการ\nเวลา: ${d.toLocaleString('th-TH')}`, 'success');
    } else {
      toast('❌ ไม่พบ backup สำหรับ Cloud Key นี้', 'error');
    }
  } catch (e) {
    toast('ตรวจสอบไม่สำเร็จ: ' + e.message, 'error');
  }
};

App.sendDailySummary = async function () {
  const cfg = Telegram.getConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) { toast('กรุณาเปิดใช้งานและตั้งค่า Telegram ก่อน', 'error'); return; }
  await Telegram.notifyDailySummary();
  toast('ส่งสรุปยอดเรียบร้อย', 'success');
};

/* ============================================================
   MySQL Functions
   ============================================================ */
App.toggleMySQL = function (enabled) {
  if (typeof MySQLBackend !== 'undefined') MySQLBackend.setEnabled(enabled);
};

App.saveMySQLConfig = async function () {
  const enabled = document.getElementById('mysql-enabled').checked;
  const url = document.getElementById('mysql-url').value.trim();
  if (typeof MySQLBackend !== 'undefined') {
    MySQLBackend.setUrl(url);
    MySQLBackend.setEnabled(enabled);
  }
  if (enabled && url) {
    toast('กำลังเชื่อมต่อ MySQL...', 'info');
    const ok = await MySQLBackend.healthCheck();
    if (ok) {
      toast('เชื่อมต่อ MySQL สำเร็จ!', 'success');
      await Store.syncFromMySQL();
    } else {
      toast('เชื่อมต่อ MySQL ไม่สำเร็จ — ตรวจสอบว่า server รันอยู่', 'error');
    }
  }
  toast('บันทึกการตั้งค่า MySQL เรียบร้อย', 'success');
  route();
};

App.testMySQL = async function () {
  if (typeof MySQLBackend === 'undefined') { toast('MySQL module ไม่พร้อมใช้งาน', 'error'); return; }
  const url = document.getElementById('mysql-url').value.trim();
  MySQLBackend.setUrl(url);
  toast('กำลังทดสอบ...', 'info');
  const ok = await MySQLBackend.healthCheck();
  if (ok) {
    toast('เชื่อมต่อ MySQL สำเร็จ! ✅', 'success');
  } else {
    toast('เชื่อมต่อไม่สำเร็จ ❌ — ตรวจสอบว่า server รันอยู่ที่ ' + url, 'error');
  }
};

App.syncFromMySQL = async function () {
  if (typeof MySQLBackend === 'undefined') { toast('MySQL module ไม่พร้อมใช้งาน', 'error'); return; }
  toast('กำลังดึงข้อมูลจาก MySQL...', 'info');
  const ok = await Store.syncFromMySQL();
  if (ok) {
    toast('ดึงข้อมูลจาก MySQL สำเร็จ! ✅', 'success');
    route();
  } else {
    toast('ดึงข้อมูลไม่สำเร็จ', 'error');
  }
};

App.syncToMySQL = async function () {
  if (typeof MySQLBackend === 'undefined') { toast('MySQL module ไม่พร้อมใช้งาน', 'error'); return; }
  toast('กำลังดันข้อมูลไป MySQL...', 'info');
  const count = await Store.syncToMySQL();
  if (count !== false) {
    toast(`ดันข้อมูลไป MySQL สำเร็จ! ${count} รายการ ✅`, 'success');
    route();
  } else {
    toast('ดันข้อมูลไม่สำเร็จ', 'error');
  }
};

/* ============================================================
   Backup & Restore
   ============================================================ */

App.exportBackup = function () {
  const db = Store.db;
  if (!db) { toast('ไม่มีข้อมูลให้ backup', 'error'); return; }
  const backup = JSON.stringify(db, null, 2);
  const blob = new Blob([backup], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  a.href = url;
  a.download = `IT-Stock-Backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('ดาวน์โหลดไฟล์ backup เรียบร้อย! ✅', 'success');
};

App.importBackup = function (input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.items)) { toast('ไฟล์ backup ไม่ถูกต้อง', 'error'); return; }
      if (!confirm(`นำเข้าข้อมูลจาก backup?\n- อุปกรณ์: ${data.items.length} รายการ\n- รายการ: ${(data.transactions || []).length} รายการ\n- ผู้ใช้: ${(data.users || []).length} คน\n\n⚠️ ข้อมูลปัจจุบันจะถูกเขียนทับ`)) return;
      localStorage.setItem('it_stock_db_v5', JSON.stringify(data));
      toast('นำเข้า backup สำเร็จ! กำลังรีเฟรช...', 'success');
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      toast('ไฟล์ backup เสียหาย: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
};

/* ============================================================
   QR Code Backup
   ============================================================ */

App.exportBackupQR = async function () {
  const db = Store.db;
  if (!db) { toast('ไม่มีข้อมูลให้ backup', 'error'); return; }
  
  // สร้าง modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;text-align:center">
      <div class="card-head"><div><h3>📱 QR Code Backup</h3>
        <p class="muted small">สแกน QR Code ด้วยมือถือเพื่อนำเข้าข้อมูล</p></div></div>
      <div id="qr-loading" style="padding:30px">
        <div class="spinner"></div>
        <p style="margin-top:10px;color:var(--text-secondary)">กำลังอัพโหลดข้อมูล...</p>
      </div>
      <div id="qr-result" style="display:none;padding:20px">
        <div id="qr-code" style="display:inline-block;margin:10px auto"></div>
        <p style="margin:10px 0;font-size:13px;color:var(--text-secondary)">สแกน QR Code ด้วยกล้องมือถือ</p>
        <div style="background:var(--bg-secondary);padding:10px;border-radius:8px;margin:10px 0;word-break:break-all;font-size:11px;color:var(--text-secondary)" id="qr-url"></div>
        <button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('qr-url').textContent);toast('คัดลอกลิงก์แล้ว!','success')" style="margin-top:10px">📋 คัดลอกลิงก์</button>
      </div>
      <div id="qr-error" style="display:none;padding:20px;color:var(--error)">
        <p>❌ ไม่สามารถสร้าง QR Code ได้</p>
        <p id="qr-error-msg" style="font-size:12px"></p>
      </div>
      <div style="padding:10px"><button class="btn" onclick="this.closest('.modal-overlay').remove()">ปิด</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  try {
    // upload to 0x0.st
    const backup = JSON.stringify(db);
    const formData = new FormData();
    formData.append('file', new Blob([backup], { type: 'application/json' }), 'it-stock-backup.json');
    
    const resp = await fetch('https://0x0.st', { method: 'POST', body: formData });
    if (!resp.ok) throw new Error('Upload failed: ' + resp.status);
    const url = (await resp.text()).trim();
    
    // แสดง QR Code
    document.getElementById('qr-loading').style.display = 'none';
    document.getElementById('qr-result').style.display = 'block';
    document.getElementById('qr-url').textContent = url;
    
    // สร้าง QR Code ชี้ไปที่หน้า import
    const importUrl = location.origin + location.pathname + '#import=' + encodeURIComponent(url);
    new QRCode(document.getElementById('qr-code'), {
      text: importUrl,
      width: 200,
      height: 200,
      colorDark: '#1e293b',
      colorLight: '#ffffff',
    });
    toast('สร้าง QR Code สำเร็จ! ✅', 'success');
  } catch (err) {
    document.getElementById('qr-loading').style.display = 'none';
    document.getElementById('qr-error').style.display = 'block';
    document.getElementById('qr-error-msg').textContent = err.message;
    console.error('QR export error:', err);
  }
};

/* Auto-import from URL hash */
App.checkImportFromURL = async function () {
  const hash = location.hash;
  if (!hash || !hash.startsWith('#import=')) return false;
  const url = decodeURIComponent(hash.slice(8));
  if (!url) return false;
  
  // ลบ hash เพื่อไม่ให้ import ซ้ำ
  history.replaceState(null, '', location.pathname);
  
  try {
    toast('กำลังดาวน์โหลดข้อมูลจาก QR Code...', 'info');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Download failed: ' + resp.status);
    const data = await resp.json();
    
    if (!data || !Array.isArray(data.items)) {
      toast('ไฟล์ backup ไม่ถูกต้อง', 'error');
      return false;
    }
    
    if (!confirm(`นำเข้าข้อมูลจาก QR Code?\n- อุปกรณ์: ${data.items.length} รายการ\n- รายการ: ${(data.transactions || []).length} รายการ\n- ผู้ใช้: ${(data.users || []).length} คน\n\n⚠️ ข้อมูลปัจจุบันจะถูกเขียนทับ`)) return false;
    
    localStorage.setItem('it_stock_db_v5', JSON.stringify(data));
    toast('นำเข้าข้อมูลสำเร็จ! กำลังรีเฟรช...', 'success');
    setTimeout(() => location.reload(), 500);
    return true;
  } catch (err) {
    toast('นำเข้าไม่สำเร็จ: ' + err.message, 'error');
    return false;
  }
};

/* Cloud Sync + Firebase removed */

/* Cloud Sync + Firebase + Local Sync functions removed */

/* ============================================================
   พิมพ์บาร์โค้ด
   ============================================================ */
function renderBarcode() {
  const stock = Store.getStock();
  const categories = Store.categories();
  
  return `
  <div class="card">
    <div class="card-head"><div><h3>พิมพ์บาร์โค้ดวัสดุ</h3><p class="muted small">เลือกวัสดุที่ต้องการพิมพ์บาร์โค้ด พร้อมตั้งค่าขนาดและจำนวน</p></div></div>
    <div class="form-grid">
      <div class="field">
        <label>เลือกหมวดหมู่</label>
        <select id="barcode-category" class="input" onchange="App.filterBarcodeItems()">
          <option value="">ทุกหมวดหมู่</option>
          ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>ขนาดบาร์โค้ด</label>
        <select id="barcode-size" class="input" onchange="App.updateBarcodePreview()">
          <option value="small">เล็ก (40x20mm)</option>
          <option value="medium" selected>กลาง (60x30mm)</option>
          <option value="large">ใหญ่ (80x40mm)</option>
          <option value="xlarge">ใหญ่มาก (100x50mm)</option>
        </select>
      </div>
      <div class="field">
        <label>จำนวนต่อรายการ</label>
        <input type="number" id="barcode-copies" class="input" min="1" max="20" value="1" onchange="App.updateBarcodePreview()">
      </div>
      <div class="field">
        <label>ประเภทบาร์โค้ด</label>
        <select id="barcode-type" class="input" onchange="App.updateBarcodePreview()">
          <option value="CODE128">CODE128 (ทั่วไป)</option>
          <option value="CODE39">CODE39</option>
          <option value="EAN13">EAN-13</option>
          <option value="EAN8">EAN-8</option>
        </select>
      </div>
      <div class="field">
        <label>รูปแบบป้าย</label>
        <select id="barcode-layout" class="input" onchange="App.updateBarcodePreview()">
          <option value="barcode-only">บาร์โค้ดอย่างเดียว</option>
          <option value="qr-only">QR Code อย่างเดียว</option>
          <option value="both" selected>บาร์โค้ด + QR Code</option>
        </select>
      </div>
    </div>
    
    <div class="field">
      <label>เลือกวัสดุที่ต้องการพิมพ์</label>
      <div style="margin-bottom: 8px;">
        <button type="button" class="btn btn-soft btn-sm" onclick="App.selectAllBarcodeItems()">เลือกทั้งหมด</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="App.clearBarcodeItems()">ล้างเลือก</button>
        <span id="barcode-selected-count" class="muted small" style="margin-left: 10px;">เลือก 0 รายการ</span>
      </div>
      <div id="barcode-items-list" class="table-wrap" style="max-height: 400px; overflow-y: auto;">
        <!-- รายการวัสดุจะแสดงที่นี่ -->
      </div>
    </div>
    
    <div class="form-actions">
      <button type="button" class="btn btn-primary" onclick="App.printBarcodes()">
        ${icon('printer', 16)} พิมพ์บาร์โค้ด
      </button>
      <button type="button" class="btn btn-soft" onclick="App.previewBarcodes()">
        ${icon('eye', 16)} ดูตัวอย่าง
      </button>
    </div>
  </div>
  
  <div id="barcode-preview-area" class="card hidden">
    <div class="card-head"><div><h3>ตัวอย่างบาร์โค้ด</h3></div></div>
    <div id="barcode-preview-content" class="label-sheet" style="display: flex; flex-wrap: wrap; gap: 10px; padding: 15px;"></div>
  </div>`;
}

function initBarcode() {
  App.filterBarcodeItems();
}

App.filterBarcodeItems = function() {
  const category = document.getElementById('barcode-category').value;
  const stock = Store.getStock();
  const filtered = category ? stock.filter(s => s.category === category) : stock;
  
  const list = document.getElementById('barcode-items-list');
  if (!list) return;
  
  list.innerHTML = `
    <table class="list">
      <thead><tr>
        <th style="width: 40px;"><input type="checkbox" id="barcode-select-all" onchange="App.toggleAllBarcodeItems(this.checked)"></th>
        <th>รหัส</th>
        <th>ชื่อวัสดุ</th>
        <th>หมวดหมู่</th>
        <th>หน่วย</th>
        <th class="num">คงเหลือ</th>
      </tr></thead>
      <tbody>
        ${filtered.map(s => `
          <tr>
            <td><input type="checkbox" class="barcode-item-check" value="${s.id}" onchange="App.updateSelectedCount()"></td>
            <td class="td-mono">${esc(s.code)}</td>
            <td><strong>${esc(s.name)}</strong></td>
            <td><span class="chip-cat">${esc(s.category)}</span></td>
            <td>${esc(s.unit)}</td>
            <td class="num">${fmtQty(s.qty)}</td>
          </tr>
        `).join('')}
        ${filtered.length === 0 ? '<tr><td colspan="6"><div class="empty">ไม่พบรายการวัสดุ</div></td></tr>' : ''}
      </tbody>
    </table>`;
  
  App.updateSelectedCount();
};

App.toggleAllBarcodeItems = function(checked) {
  document.querySelectorAll('.barcode-item-check').forEach(cb => { cb.checked = checked; });
  App.updateSelectedCount();
};

App.selectAllBarcodeItems = function() {
  document.querySelectorAll('.barcode-item-check').forEach(cb => { cb.checked = true; });
  App.updateSelectedCount();
};

App.clearBarcodeItems = function() {
  document.querySelectorAll('.barcode-item-check').forEach(cb => { cb.checked = false; });
  App.updateSelectedCount();
};

App.updateSelectedCount = function() {
  const count = document.querySelectorAll('.barcode-item-check:checked').length;
  const el = document.getElementById('barcode-selected-count');
  if (el) el.textContent = `เลือก ${count} รายการ`;
};

App.updateBarcodePreview = function() {
  // Update preview if visible
  const previewArea = document.getElementById('barcode-preview-area');
  if (previewArea && !previewArea.classList.contains('hidden')) {
    App.previewBarcodes();
  }
};

App.previewBarcodes = function() {
  const selectedIds = Array.from(document.querySelectorAll('.barcode-item-check:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    toast('กรุณาเลือกวัสดุอย่างน้อย 1 รายการ', 'error');
    return;
  }
  
  const size = document.getElementById('barcode-size').value;
  const copies = parseInt(document.getElementById('barcode-copies').value) || 1;
  const barcodeType = document.getElementById('barcode-type').value;
  const layout = document.getElementById('barcode-layout').value;
  
  const sizeMap = {
    small: { width: 1, height: 40, fontSize: 10, qrSize: 60 },
    medium: { width: 2, height: 60, fontSize: 12, qrSize: 80 },
    large: { width: 2, height: 80, fontSize: 14, qrSize: 100 },
    xlarge: { width: 3, height: 100, fontSize: 16, qrSize: 120 },
  };
  const s = sizeMap[size] || sizeMap.medium;
  
  const previewArea = document.getElementById('barcode-preview-area');
  const previewContent = document.getElementById('barcode-preview-content');
  previewArea.classList.remove('hidden');
  
  let html = '';
  selectedIds.forEach(id => {
    const item = Store.getItem(id);
    if (!item) return;
    
    for (let i = 0; i < copies; i++) {
      const barcodeHtml = layout !== 'qr-only' ? `<svg class="barcode-svg" id="barcode-${item.id}-${i}" style="max-width: 100%;"></svg>` : '';
      const qrHtml = layout !== 'barcode-only' ? `<div id="qr-${item.id}-${i}" style="margin-top: 5px;"></div>` : '';
      
      html += `
        <div class="barcode-label" style="border: 1px solid #ddd; padding: 10px; text-align: center; background: white; min-width: 120px;">
          ${barcodeHtml}
          ${qrHtml}
          <div style="font-size: ${s.fontSize}px; margin-top: 5px; font-weight: bold;">${esc(item.name)}</div>
          <div style="font-size: ${s.fontSize - 2}px; color: #666;">${esc(item.code)}</div>
        </div>`;
    }
  });
  
  previewContent.innerHTML = html;
  
  // Generate barcodes and QR codes
  setTimeout(() => {
    selectedIds.forEach(id => {
      const item = Store.getItem(id);
      if (!item) return;
      
      for (let i = 0; i < copies; i++) {
        // Generate barcode
        if (layout !== 'qr-only') {
          const svgEl = document.getElementById(`barcode-${id}-${i}`);
          if (svgEl && typeof JsBarcode !== 'undefined') {
            try {
              JsBarcode(svgEl, item.code, {
                format: barcodeType,
                width: s.width,
                height: s.height,
                displayValue: layout === 'barcode-only',
                fontSize: s.fontSize,
                margin: 5,
              });
            } catch (e) {
              console.error('Barcode generation error:', e);
              svgEl.insertAdjacentHTML('afterend', '<div style="color: red; font-size: 12px;">ไม่สามารถสร้างบาร์โค้ดได้</div>');
            }
          }
        }
        
        // Generate QR code
        if (layout !== 'barcode-only') {
          const qrEl = document.getElementById(`qr-${id}-${i}`);
          if (qrEl && typeof qrcode === 'function') {
            try {
              const qr = qrcode(0, 'M');
              qr.addData(item.code);
              qr.make();
              const qrImg = qr.createDataURL(4, 0);
              qrEl.innerHTML = `<img src="${qrImg}" style="width: ${s.qrSize}px; height: ${s.qrSize}px;">`;
            } catch (e) {
              console.error('QR generation error:', e);
              qrEl.innerHTML = '<div style="color: red; font-size: 12px;">ไม่สามารถสร้าง QR ได้</div>';
            }
          }
        }
      }
    });
  }, 100);
};

App.printBarcodes = function() {
  const selectedIds = Array.from(document.querySelectorAll('.barcode-item-check:checked')).map(cb => cb.value);
  if (selectedIds.length === 0) {
    toast('กรุณาเลือกวัสดุอย่างน้อย 1 รายการ', 'error');
    return;
  }
  
  const size = document.getElementById('barcode-size').value;
  const copies = parseInt(document.getElementById('barcode-copies').value) || 1;
  const barcodeType = document.getElementById('barcode-type').value;
  const layout = document.getElementById('barcode-layout').value;
  
  const sizeMap = {
    small: { width: 1, height: 40, fontSize: 10, css: 'width: 40mm; height: 25mm;', qrSize: 50 },
    medium: { width: 2, height: 60, fontSize: 12, css: 'width: 60mm; height: 35mm;', qrSize: 60 },
    large: { width: 2, height: 80, fontSize: 14, css: 'width: 80mm; height: 45mm;', qrSize: 70 },
    xlarge: { width: 3, height: 100, fontSize: 16, css: 'width: 100mm; height: 55mm;', qrSize: 80 },
  };
  const s = sizeMap[size] || sizeMap.medium;
  
  // Pre-generate QR codes as data URLs
  const qrDataUrls = {};
  if (layout !== 'barcode-only' && typeof qrcode === 'function') {
    selectedIds.forEach(id => {
      const item = Store.getItem(id);
      if (!item) return;
      try {
        const qr = qrcode(0, 'M');
        qr.addData(item.code);
        qr.make();
        qrDataUrls[id] = qr.createDataURL(4, 0);
      } catch (e) {
        console.error('QR generation error:', e);
      }
    });
  }
  
  let printContent = '<html><head><title>พิมพ์บาร์โค้ด</title>';
  printContent += '<style>';
  printContent += 'body { font-family: Arial, sans-serif; margin: 0; padding: 10px; }';
  printContent += '.barcode-container { display: flex; flex-wrap: wrap; gap: 5mm; }';
  printContent += '.barcode-item { border: 1px solid #ccc; padding: 5mm; text-align: center; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; justify-content: center; }';
  printContent += '.barcode-item svg { max-width: 100%; }';
  printContent += '.barcode-name { font-size: 10pt; font-weight: bold; margin-top: 2mm; }';
  printContent += '.barcode-code { font-size: 8pt; color: #666; }';
  printContent += '.qr-image { margin-top: 2mm; }';
  printContent += '@media print { .no-print { display: none; } }';
  printContent += '</style></head><body>';
  printContent += '<div class="no-print" style="text-align: center; margin-bottom: 10px;">';
  printContent += '<button onclick="window.print()">พิมพ์</button>';
  printContent += '<button onclick="window.close()">ปิด</button>';
  printContent += '</div>';
  printContent += '<div class="barcode-container">';
  
  selectedIds.forEach(id => {
    const item = Store.getItem(id);
    if (!item) return;
    
    for (let i = 0; i < copies; i++) {
      const barcodeId = `print-barcode-${id}-${i}`;
      const barcodeHtml = layout !== 'qr-only' ? `<svg id="${barcodeId}"></svg>` : '';
      const qrHtml = layout !== 'barcode-only' && qrDataUrls[id] 
        ? `<div class="qr-image"><img src="${qrDataUrls[id]}" style="width: ${s.qrSize}px; height: ${s.qrSize}px;"></div>` 
        : '';
      
      printContent += `
        <div class="barcode-item" style="${s.css}">
          ${barcodeHtml}
          ${qrHtml}
          <div class="barcode-name">${esc(item.name)}</div>
          <div class="barcode-code">${esc(item.code)}</div>
        </div>`;
    }
  });
  
  printContent += '</div>';
  printContent += '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>';
  printContent += '<script>';
  printContent += 'window.onload = function() {';
  
  selectedIds.forEach(id => {
    const item = Store.getItem(id);
    if (!item) return;
    
    for (let i = 0; i < copies; i++) {
      if (layout !== 'qr-only') {
        const barcodeId = `print-barcode-${id}-${i}`;
        printContent += `try { JsBarcode('#${barcodeId}', '${item.code.replace(/'/g, "\\'")}', { format: '${barcodeType}', width: ${s.width}, height: ${s.height}, displayValue: ${layout === 'barcode-only'}, fontSize: ${s.fontSize}, margin: 5 }); } catch(e) { console.error(e); }`;
      }
    }
  });
  
  printContent += '};';
  printContent += '<\/script></body></html>';
  
  // Open print window
  try {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow && !printWindow.closed) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
      return;
    }
  } catch(e) {}
  // Fallback: iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;border:none;background:#fff';
  iframe.srcdoc = printContent;
  document.body.appendChild(iframe);
  iframe.onload = () => { try { iframe.contentWindow.print(); } catch(e) {} };
  setTimeout(() => { if (iframe.parentNode) iframe.remove(); }, 5000);
};

/* ============================================================
   รายการต้องสั่งเพิ่ม
   ============================================================ */
function renderReorder() {
  const stock = Store.getStock();
  const categories = Store.categories();
  const reorderItems = Store.getReorderItems();
  const categoryOptions = categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const qtyOptions = Array.from({ length: 100 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');

  const itemRows = reorderItems.map(ri => {
    const item = Store.getItem(ri.itemId);
    const displayName = ri.itemName || (item ? item.name : ri.itemId);
    const cat = ri.category || (item ? item.category : '-');
    return `<tr>
      <td>${esc(displayName)}</td>
      <td>${esc(cat)}</td>
      <td class="num">${fmtQty(ri.qty)}</td>
      <td>${esc(ri.unit || (item ? item.unit : ''))}</td>
      <td class="actions">
        <button class="btn-icon danger" onclick="App.deleteReorderItem('${ri.id}')" title="ลบรายการ">${icon('trash', 16)}</button>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="card">
    <div class="card-head"><div><h3>เพิ่มรายการต้องสั่งเพิ่ม</h3><p class="muted small">เลือกวัสดุและระบุจำนวนที่ต้องสั่งซื้อเพิ่ม</p></div></div>
    <form id="reorder-form" onsubmit="App.addReorderItem(event)">
      <div class="form-grid">
        <div class="field">
          <label>หมวดหมู่ *</label>
          <select id="reorder-category" class="input" required onchange="App.onReorderCategoryChange(); document.getElementById('reorder-category-custom').classList.toggle('hidden', this.value !== 'other')">
            <option value="">— เลือกหมวดหมู่ —</option>
            ${categoryOptions}
            <option value="other">... พิมพ์เอง</option>
          </select>
          <input id="reorder-category-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่อหมวดหมู่">
        </div>
        <div class="field">
          <label>อุปกรณ์ *</label>
          <select id="reorder-item" class="input" required onchange="document.getElementById('reorder-item-custom').classList.toggle('hidden', this.value !== 'other')">
            <option value="">— เลือกวัสดุ —</option>
            ${stock.map(s => `<option value="${s.id}" data-cat="${esc(s.category)}" data-unit="${esc(s.unit)}">${esc(s.name)} (${esc(s.code)}) — คงเหลือ ${fmtQty(s.qty)} ${esc(s.unit)}</option>`).join('')}
            <option value="other">... พิมพ์เอง</option>
          </select>
          <input id="reorder-item-custom" class="input mt-2 hidden" placeholder="พิมพ์ชื่ออุปกรณ์ที่ต้องสั่งเพิ่ม">
        </div>
        <div class="field">
          <label>จำนวนที่ต้องสั่ง *</label>
          <select id="reorder-qty" class="input" required>
            <option value="">— เลือกจำนวน —</option>
            ${qtyOptions}
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${icon('plus', 16)} เพิ่มรายการ</button>
      </div>
    </form>
    <div style="margin-top:12px;">
      <p class="muted small" style="margin-bottom:6px;">🔍 ค้นหาวัสดุใกล้หมด (คงเหลือไม่เกิน):</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
        ${[1,2,3,4,5,6,7,8,9,10,15,20,30,50].map(n => `<button type="button" class="btn btn-soft btn-sm" onclick="App.findLowStock(${n})" style="min-width:36px;">${n}</button>`).join('')}
      </div>
      <div id="low-stock-result" class="hidden" style="margin-top:10px;"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><div><h3>รายการที่ต้องสั่งเพิ่ม</h3><p class="muted small">${reorderItems.length} รายการ</p></div>
      <div class="card-head-actions">
        ${reorderItems.length ? `
          <button class="btn btn-success" onclick="App.exportReorderExcel()">${icon('download', 16)} ส่งออก Excel</button>
          <button class="btn btn-primary" onclick="App.exportReorderPDF()">${icon('printer', 16)} ส่งออก PDF</button>
          <button class="btn btn-ghost danger" onclick="App.clearReorderItems()">${icon('trash', 16)} ล้างทั้งหมด</button>
        ` : ''}
      </div>
    </div>
    ${reorderItems.length ? `
      <table class="table">
        <thead><tr><th>อุปกรณ์</th><th>หมวดหมู่</th><th class="num">จำนวน</th><th>หน่วย</th><th></th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    ` : '<p class="empty-state">ยังไม่มีรายการต้องสั่งเพิ่ม</p>'}
  </div>`;
}

App.onReorderCategoryChange = function () {
  const raw = document.getElementById('reorder-category').value;
  const cat = raw === 'other' ? '' : raw;
  const itemSel = document.getElementById('reorder-item');
  const prevVal = itemSel.value;
  /* เก็บตัวเลือกเดิมทั้งหมดไว้ใน data attribute */
  if (!itemSel._allOptions) {
    itemSel._allOptions = Array.from(itemSel.options).map(o => ({ val: o.value, text: o.text, cat: o.dataset.cat || '' }));
  }
  /* ล้าง options แล้วใส่เฉพาะที่ตรงหมวด */
  itemSel.innerHTML = '<option value="">— เลือกวัสดุ —</option>';
  itemSel._allOptions.forEach(o => {
    if (!o.val) return;
    /* เก็บตัวเลือก 'other' ไว้ท้ายสุดเสมอ */
    if (o.val === 'other') return;
    if (!cat || o.cat === cat) {
      const opt = document.createElement('option');
      opt.value = o.val;
      opt.textContent = o.text;
      opt.dataset.cat = o.cat;
      itemSel.appendChild(opt);
    }
  });
  /* เพิ่ม 'พิมพ์เอง' ต่อท้ายเสมอ */
  const otherOpt = document.createElement('option');
  otherOpt.value = 'other';
  otherOpt.textContent = '... พิมพ์เอง';
  itemSel.appendChild(otherOpt);
  /* พยายามเลือกค่าเดิมถ้ายังมี */
  if (prevVal && itemSel.querySelector(`option[value="${prevVal}"]`)) itemSel.value = prevVal;
};

App.findLowStock = function (threshold) {
  const stock = Store.getStock();
  const lowItems = stock.filter(s => s.qty >= 0 && s.qty <= threshold);
  const resultDiv = document.getElementById('low-stock-result');
  if (!lowItems.length) {
    resultDiv.innerHTML = '<p class="muted small" style="padding:8px;background:#f8f8f8;border-radius:6px;">✅ ไม่มีวัสดุที่คงเหลือไม่เกิน ' + threshold + ' ชิ้น</p>';
    resultDiv.classList.remove('hidden');
    return;
  }
  const rows = lowItems.map(s => {
    const status = s.qty <= 0 ? '🔴 หมด' : '🟡 ใกล้หมด';
    return `<tr>
      <td>${esc(s.name)}</td>
      <td>${esc(s.category || '-')}</td>
      <td class="num">${fmtQty(s.qty)} ${esc(s.unit)}</td>
      <td>${status}</td>
      <td><button class="btn btn-soft btn-sm" onclick="App.addLowStockToReorder('${s.id}')" title="เพิ่มรายการสั่งซื้อ">${icon('plus', 14)} สั่งซื้อ</button></td>
    </tr>`;
  }).join('');
  resultDiv.innerHTML = `
    <div style="padding:10px;background:#fff8e6;border:1px solid #f0d060;border-radius:8px;">
      <p class="muted small" style="margin-bottom:6px;">📋 พบ ${lowItems.length} รายการที่คงเหลือไม่เกิน ${threshold}:</p>
      <table class="table" style="margin:0;">
        <thead><tr><th>อุปกรณ์</th><th>หมวดหมู่</th><th class="num">คงเหลือ</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:8px;">
        <button class="btn btn-primary btn-sm" onclick="App.addAllLowStock([${lowItems.map(s => `'${s.id}'`).join(',')}])">${icon('plus', 14)} เพิ่มทั้งหมด (${lowItems.length} รายการ)</button>
      </div>
    </div>`;
  resultDiv.classList.remove('hidden');
};

App.addLowStockToReorder = function (itemId) {
  const item = Store.getItem(itemId);
  if (!item) return;
  Store.addReorderItem({
    itemId,
    itemName: item.name,
    category: item.category || '',
    qty: Math.max(item.minStock || 1, 1),
    unit: item.unit || '',
    note: ''
  });
  toast(`เพิ่ม ${item.name} แล้ว`);
};

App.addAllLowStock = function (ids) {
  ids.forEach(id => {
    const item = Store.getItem(id);
    if (!item) return;
    Store.addReorderItem({
      itemId: id,
      itemName: item.name,
      category: item.category || '',
      qty: Math.max(item.minStock || 1, 1),
      unit: item.unit || '',
      note: ''
    });
  });
  toast(`เพิ่ม ${ids.length} รายการแล้ว`);
  App.go('#/reorder');
};

App.addReorderItem = function (ev) {
  ev.preventDefault();
  const itemVal = document.getElementById('reorder-item').value;
  const qty = Number(document.getElementById('reorder-qty').value);
  const catRaw = document.getElementById('reorder-category').value;
  const catVal = catRaw === 'other' ? (document.getElementById('reorder-category-custom').value || '').trim() : catRaw;
  if (!itemVal) { toast('กรุณาเลือกวัสดุ', 'error'); return; }
  if (!qty || qty <= 0) { toast('กรุณาระบุจำนวน', 'error'); return; }
  let itemId = itemVal;
  let itemName = '';
  let itemUnit = '';
  if (itemVal === 'other') {
    itemName = (document.getElementById('reorder-item-custom').value || '').trim();
    if (!itemName) { toast('กรุณาพิมพ์ชื่ออุปกรณ์', 'error'); return; }
    itemId = 'custom_' + Date.now().toString(36);
  } else {
    const item = Store.getItem(itemId);
    itemName = item ? item.name : '';
    itemUnit = item ? item.unit : '';
  }
  Store.addReorderItem({
    itemId,
    itemName,
    category: catVal || '',
    qty,
    unit: itemUnit,
    note: ''
  });
  toast('เพิ่มรายการเรียบร้อย');
  App.go('#/reorder');
};

App.deleteReorderItem = function (id) {
  confirmAction('ลบรายการ', 'ยืนยันลบรายการนี้?', () => {
    Store.deleteReorderItem(id);
    toast('ลบรายการแล้ว');
    App.go('#/reorder');
  });
};

App.clearReorderItems = function () {
  confirmAction('ล้างทั้งหมด', 'ยืนยันล้างรายการทั้งหมด?', () => {
    Store.clearReorderItems();
    toast('ล้างรายการแล้ว');
    App.go('#/reorder');
  });
};

App.exportReorderExcel = function () {
  const reorderItems = Store.getReorderItems();
  if (!reorderItems.length) { toast('ไม่มีรายการให้ส่งออก', 'error'); return; }
  const rows = reorderItems.map((ri, i) => {
    const item = Store.getItem(ri.itemId);
    const displayName = ri.itemName || (item ? item.name : ri.itemId);
    const cat = ri.category || (item ? item.category : '-');
    return [i + 1, displayName, cat, fmtQty(ri.qty), ri.unit || (item ? item.unit : '')];
  });
  const totalQty = reorderItems.reduce((s, ri) => s + ri.qty, 0);
  rows.push(['', 'รวม', '', fmtQty(totalQty), '']);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  exportExcel(`รายการสั่งเพิ่ม_${stamp}.xlsx`, [
    { label: 'ลำดับ' }, { label: 'อุปกรณ์' }, { label: 'หมวดหมู่' }, { label: 'จำนวน' }, { label: 'หน่วย' }
  ], rows, 'รายการต้องสั่งเพิ่ม');
};

App.exportReorderPDF = function () {
  const reorderItems = Store.getReorderItems();
  if (!reorderItems.length) { toast('ไม่มีรายการให้ส่งออก', 'error'); return; }
  const today = todayStr();
  const rows = reorderItems.map((ri, i) => {
    const item = Store.getItem(ri.itemId);
    const displayName = ri.itemName || (item ? item.name : ri.itemId);
    const cat = ri.category || (item ? item.category : '-');
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(displayName)}</td>
      <td>${esc(cat)}</td>
      <td class="num">${fmtQty(ri.qty)}</td>
      <td>${esc(ri.unit || (item ? item.unit : ''))}</td>
    </tr>`;
  }).join('');

  const totalQty = reorderItems.reduce((s, ri) => s + ri.qty, 0);

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<title>รายการต้องสั่งเพิ่ม</title>
<style>
  body { font-family: 'Sarabun', 'Segoe UI', sans-serif; margin: 20mm; color: #222; }
  h1 { text-align: center; font-size: 18pt; margin-bottom: 4px; }
  .sub { text-align: center; color: #666; font-size: 10pt; margin-bottom: 20px; }
  .doc-no { text-align: right; font-size: 10pt; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #999; padding: 6px 10px; }
  th { background: #f0f0f0; font-weight: 600; }
  .num { text-align: right; }
  tfoot td { font-weight: 600; background: #f8f8f8; }
  .sig-area { margin-top: 40px; display: flex; justify-content: space-between; }
  .sig-box { width: 30%; text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 4px; }
  @media print { body { margin: 15mm; } }
</style>
</head><body>
  <h1>รายการต้องสั่งเพิ่ม</h1>
  <div class="sub">กลุ่มงานเทคโนโลยีสารสนเทศ — ระบบบริหารจัดการวัสดุและอุปกรณ์</div>
  <div class="doc-no">วันที่พิมพ์: ${today}</div>
  <table>
    <thead><tr><th>ลำดับ</th><th>อุปกรณ์</th><th>หมวดหมู่</th><th class="num">จำนวน</th><th>หน่วย</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">รวม</td><td class="num">${fmtQty(totalQty)}</td><td></td></tr></tfoot>
  </table>
  <div class="sig-area">
    <div class="sig-box"><div class="sig-line">ผู้จัดทำ</div></div>
    <div class="sig-box"><div class="sig-line">ผู้ตรวจสอบ</div></div>
    <div class="sig-box"><div class="sig-line">ผู้อนุมัติ</div></div>
  </div>
</body></html>`;

  /* ลองเปิด popup ก่อน ถ้าไม่ได้ใช้ iframe สำรอง */
  try {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (win && !win.closed) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
      return;
    }
  } catch(e) {}
  /* Fallback: ใช้ iframe สำหรับ Electron */
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;border:none;background:#fff';
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  iframe.onload = () => { try { iframe.contentWindow.print(); } catch(e) {} };
  setTimeout(() => { if (iframe.parentNode) iframe.remove(); }, 5000);
};

/* ============================================================
   ตารางเส้นทาง (views)
   ============================================================ */
/* ============================================================
   ตารางเส้นทาง (views)
   ============================================================ */
const Views = {
  dashboard: { title: 'หน้าหลัก', sub: 'ภาพรวมคลังวัสดุและอุปกรณ์', render: renderDashboard },
  receive: {
    title: 'รับเข้าวัสดุ', sub: 'บันทึกวัสดุที่รับเข้าคลัง',
    render: (params) => renderTxForm('receive') + renderTxHistory('receive', { stockEdits: params && params.tab === 'stockedits' }),
    init: () => App.addTxRow('receive'),
  },
  issue: {
    title: 'จำหน่าย / เบิกจ่าย', sub: 'บันทึกการจำหน่ายหรือเบิกวัสดุออกจากคลัง',
    render: (params) => renderTxForm('issue') + renderTxHistory('issue', { stockEdits: params && params.tab === 'stockedits' }),
    init: () => App.addTxRow('issue'),
  },
  stock: { title: 'คงเหลือ', sub: 'ยอดคงเหลือปัจจุบันของวัสดุทั้งหมด', render: renderStock, init: (params) => App.filterStock(params) },
  reports: { title: 'รายงาน', sub: 'ออกรายงานและส่งออกเป็น Excel / PDF', render: renderReports, init: renderReportPreview },
  barcode: { title: 'พิมพ์บาร์โค้ด', sub: 'พิมพ์บาร์โค้ดสำหรับวัสดุ', render: renderBarcode, init: initBarcode },
  reorder: { title: 'รายการต้องสั่งเพิ่ม', sub: 'จัดรายการวัสดุที่ต้องสั่งซื้อเพิ่ม', render: renderReorder },
  users: { title: 'ผู้ใช้งาน', sub: 'จัดการบัญชีและสิทธิ์การใช้งาน', render: renderUsers },
  settings: { title: 'ตั้งค่า', sub: 'ตั้งค่าระบบแจ้งเตือนและการเชื่อมต่อ', render: renderSettings },
};
