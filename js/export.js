'use strict';

/* ============================================================
   Export — Excel (SheetJS + fallback CSV) และ PDF (พิมพ์)
   คอลัมน์: [{label, align?}] , แถว: array of values
   ============================================================ */

function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 150);
}

function exportExcel(filename, cols, rows, sheetName = 'รายงาน') {
  const headers = cols.map(c => c.label);
  const aoa = [headers, ...rows];
  let used = null;
  if (window.XLSX) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map((h, i) => ({
      wch: Math.min(40, Math.max(String(h).length + 3, ...rows.slice(0, 200).map(r => String(r[i] == null ? '' : r[i]).length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename);
    used = true;
  } else {
    const csv = '\uFEFF' + aoa.map(r => r.map(c => {
      c = String(c == null ? '' : c);
      return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
    }).join(',')).join('\r\n');
    downloadBlob(filename.replace(/\.xlsx?$/i, '.csv'), new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    used = true;
  }
  toast(used ? 'ส่งออกไฟล์เรียบร้อยแล้ว' : 'ส่งออกไม่สำเร็จ', used ? 'success' : 'error');
}

function buildTableHtml(cols, rows) {
  const head = cols.map(c => `<th class="${c.align === 'right' ? 'pr-num' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) =>
    `<td class="${(cols[i] || {}).align === 'right' ? 'pr-num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
}

/* ============================================================
   ป้ายวัสดุ QR Code (พิมพ์ติดชั้น / ติดกล่อง)
   ============================================================ */
function qrDataUrl(text) {
  if (typeof qrcode !== 'function') return '';
  try {
    const qr = qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createDataURL(4, 0);
  } catch (e) { return ''; }
}

function labelHtml(it) {
  const qr = qrDataUrl(it.code);
  return `<div class="label">
    <div class="label-qr">${qr ? `<img src="${qr}" alt="QR ${esc(it.code)}">` : `<span class="label-noqr">${icon('tag', 20)}</span>`}</div>
    <div class="label-info">
      <div class="label-code">${esc(it.code)}</div>
      <div class="label-name">${esc(it.name)}</div>
      <div class="label-meta">${esc(it.category)}${it.location ? ' • ' + esc(it.location) : ''}</div>
    </div>
  </div>`;
}

function exportLabelSheet(itemId, copies) {
  const it = Store.getItem(itemId);
  if (!it) return;
  const n = Math.max(1, Math.min(50, Number(copies) || 1));
  const labels = Array.from({ length: n }, () => labelHtml(it)).join('');
  const body = `
    <div class="label-toolbar">
      <span class="muted small">จำนวนป้าย:</span>
      <input type="number" id="label-copies" class="input" style="width:84px" min="1" max="50" value="${n}" oninput="App.renderLabels('${it.id}')">
      <span class="muted small">${esc(it.name)} (${esc(it.code)})</span>
      ${typeof qrcode !== 'function' ? '<span class="badge badge-warning">ไม่พบไลบรารี QR (ออฟไลน์) — ป้ายจะไม่มีรหัส QR</span>' : ''}
    </div>
    <div class="label-sheet" id="label-sheet">${labels}</div>`;
  openModal(modalShell('พิมพ์ป้ายวัสดุ', body,
    `<button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
     <button class="btn btn-primary" onclick="window.print()">${icon('printer', 16)} พิมพ์ป้าย / บันทึกเป็น PDF</button>`), { wide: true });
}

function exportLabelSheetAll() {
  const items = Store.getStock().map(s => Store.getItem(s.id)).filter(Boolean);
  const labels = items.map(labelHtml).join('');
  const body = `
    <div class="label-toolbar">
      <span class="muted small">${items.length} รายการ • ป้ายละ 1 ชุด • เรียงตามรหัสวัสดุ</span>
      ${typeof qrcode !== 'function' ? '<span class="badge badge-warning">ไม่พบไลบรารี QR (ออฟไลน์) — ป้ายจะไม่มีรหัส QR</span>' : ''}
    </div>
    <div class="label-sheet" id="label-sheet">${labels}</div>`;
  openModal(modalShell('พิมพ์ป้ายวัสดุทั้งหมด', body,
    `<button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
     <button class="btn btn-primary" onclick="window.print()">${icon('printer', 16)} พิมพ์ป้าย / บันทึกเป็น PDF</button>`), { wide: true });
}

/* ============================================================
   เอกสารราชการ: ใบรับเข้าวัสดุ / ใบเบิกวัสดุ (พิมพ์ได้)
   ============================================================ */
function exportTxDoc(txId) {
  const tx = Store.transactions().find(t => t.id === txId);
  if (!tx) return;
  const isRcv = tx.type === 'receive';
  const docName = isRcv ? 'ใบรับเข้าวัสดุ' : 'ใบเบิกวัสดุ';
  const totalQty = tx.items.reduce((s, l) => s + l.qty, 0);
  const partyLabel = isRcv ? 'ผู้ส่ง / ผู้จำหน่าย' : 'กลุ่มงาน / ภารกิจ';
  const sigs = isRcv ? ['ผู้ส่งมอบ', 'ผู้รับของ', 'ผู้ตรวจรับ'] : ['ผู้เบิก', 'ผู้จ่ายวัสดุ', 'ผู้อนุมัติ'];

  const headCols = '<th class="pr-num">ลำดับ</th><th>รายการวัสดุ</th><th>รหัส</th><th>หน่วย</th><th class="pr-num">จำนวน</th>';
  const itemRows = tx.items.map((l, i) => {
    const it = Store.getItem(l.itemId) || {};
    const serialLine = l.serials && l.serials.length ? `<div class="doc-serial">Serial: ${esc(l.serials.join(', '))}</div>` : '';
    return `<tr><td class="pr-num">${i + 1}</td><td>${esc(l.name)}${serialLine}</td><td>${esc(it.code || '')}</td><td>${esc(it.unit || '')}</td><td class="pr-num">${fmtQty(l.qty)}</td></tr>`;
  }).join('');

  const foot = `<tfoot><tr><td class="pr-num">รวม</td><td colspan="3"></td><td class="pr-num">${fmtQty(totalQty)}</td></tr></tfoot>`;

  const amountText = '';
  const noteHtml = tx.note ? `<div class="doc-note"><span class="doc-note-label">หมายเหตุ:</span> ${esc(tx.note)}</div>` : '';

  const body = `
  <div class="print-sheet doc">
    <div class="doc-head">
      <div class="doc-org">กลุ่มงานเทคโนโลยีสารสนเทศ<br><span>ระบบบริหารจัดการวัสดุและอุปกรณ์</span></div>
      <div class="doc-no"><span>เลขที่เอกสาร</span><strong>${esc(tx.no)}</strong></div>
    </div>
    <div class="doc-title">${docName}</div>
    <table class="doc-info">
      <tr><td class="doc-info-label">${partyLabel}</td><td><strong>${esc(tx.party)}</strong></td></tr>
      ${!isRcv && tx.receiver ? `<tr><td class="doc-info-label">ผู้เบิก</td><td><strong>${esc(tx.receiver)}</strong></td></tr>` : ''}
      ${!isRcv && tx.partyRx ? `<tr><td class="doc-info-label">ผู้รับ</td><td><strong>${esc(tx.partyRx)}</strong></td></tr>` : ''}
      <tr><td class="doc-info-label">วันที่</td><td>${fmtDate(tx.date)}</td></tr>
      <tr><td class="doc-info-label">ผู้บันทึก</td><td>${esc(tx.byName)}</td></tr>
    </table>
    <table class="print-table doc-items">
      <thead><tr>${headCols}</tr></thead>
      <tbody>${itemRows}</tbody>
      ${foot}
    </table>
    ${amountText}
    ${noteHtml}
    <div class="print-sig">
      ${sigs.map(s => `<div><div class="sig-line"></div><div>${esc(s)}</div></div>`).join('')}
    </div>
  </div>
  <div class="print-actions">
    <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
    <button class="btn btn-primary" onclick="window.print()">${icon('printer', 16)} พิมพ์ / บันทึกเป็น PDF</button>
  </div>`;
  openModal(`<div class="modal-head"><h3>${docName} ${esc(tx.no)}</h3><button class="btn-icon" onclick="closeModal()" title="ปิด">${icon('x', 18)}</button></div>
    <div class="modal-body">${body}</div>`, { wide: true });
}

function exportPDF(title, subtitle, cols, rows, opts = {}) {
  const totalsRow = opts.totalsRow;
  const sigs = opts.sigs || ['ผู้จัดทำ', 'ผู้ตรวจสอบ', 'ผู้อนุมัติ'];
  const table = buildTableHtml(cols, rows) +
    (totalsRow ? `<tfoot><tr>${totalsRow.map(c => `<td class="pr-num">${esc(c)}</td>`).join('')}</tr></tfoot>` : '');
  const body = `
    <div class="print-sheet">
      <div class="print-head">
        <div class="print-org">กลุ่มงานเทคโนโลยีสารสนเทศ<br><span>ระบบบริหารจัดการวัสดุและอุปกรณ์</span></div>
        <div class="print-title">${esc(title)}</div>
        <div class="print-meta">${esc(subtitle || '')}<br>พิมพ์เมื่อ ${fmtDateTime(Date.now())}</div>
      </div>
      <table class="print-table">${table}</table>
      <div class="print-sig">
        ${sigs.map(s => `<div><div class="sig-line"></div><div>${esc(s)}</div></div>`).join('')}
      </div>
    </div>
    <div class="print-actions">
      <button class="btn btn-ghost" onclick="closeModal()">ปิด</button>
      <button class="btn btn-primary" onclick="window.print()">${icon('printer', 16)} พิมพ์ / บันทึกเป็น PDF</button>
    </div>`;
  openModal(`<div class="modal-head"><h3>${esc(title)}</h3><button class="btn-icon" onclick="closeModal()" title="ปิด">${icon('x', 18)}</button></div>
    <div class="modal-body">${body}</div>`, { wide: true });
}
