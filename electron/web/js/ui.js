'use strict';

/* ============================================================
   UI helpers — ไอคอน, ฟอร์แมต, ทอสต์, โมดัล
   ============================================================ */

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  receive: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  issue: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
};

function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

const $ = s => document.querySelector(s);

/* ---------- ฟอร์แมต ---------- */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtMoney(n) { return (Number(n) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
function fmtQty(n) { return (Number(n) || 0).toLocaleString('th-TH'); }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(ts) {
  const dt = new Date(ts);
  return dt.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function todayLabel() {
  return new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------- ตัวเลขไทย (จำนวนเป็นตัวอักษร) ---------- */
function thaiNumToText(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'ศูนย์';
  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const pos = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
  const groups = [];
  while (num > 0) { groups.push(num % 1e6); num = Math.floor(num / 1e6); }
  let out = '';
  for (let g = groups.length - 1; g >= 0; g--) {
    const v = groups[g];
    if (v === 0) continue;
    const s = String(v).padStart(6, '0');
    let part = '';
    for (let i = 0; i < 6; i++) {
      const d = Number(s[i]);
      if (d === 0) continue;
      const p = 5 - i; /* 0=หน่วย, 1=สิบ, 2=ร้อย, 3=พัน, 4=หมื่น, 5=แสน */
      if (p === 1) {
        if (d === 1) part += 'สิบ';
        else if (d === 2) part += 'ยี่สิบ';
        else part += digits[d] + 'สิบ';
      } else if (p === 0) {
        part += (d === 1 && part !== '') ? 'เอ็ด' : digits[d];
      } else {
        part += digits[d] + pos[p];
      }
    }
    out += part + (g > 0 ? 'ล้าน' : '');
  }
  return out;
}

function thaiMoneyText(n) {
  const v = Math.round(Number(n || 0) * 100);
  const baht = Math.floor(v / 100);
  const satang = v % 100;
  let s = thaiNumToText(baht) + 'บาท';
  s += satang > 0 ? thaiNumToText(satang) + 'สตางค์' : 'ถ้วน';
  return s;
}

/* ---------- ทอสต์ ---------- */
function toast(msg, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  const ic = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
  el.innerHTML = `${icon(ic, 18)}<span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3400);
}

/* ---------- โมดัล ---------- */
function openModal(html, opts = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal ${opts.wide ? 'modal-wide' : ''}">${html}</div>`;
  ov.addEventListener('mousedown', e => { if (e.target === ov && !opts.noDismiss) closeModal(); });
  root.appendChild(ov);
  return ov.querySelector('.modal');
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
function modalShell(title, body, foot = '') {
  return `<div class="modal-head"><h3>${title}</h3><button class="btn-icon" onclick="closeModal()" title="ปิด">${icon('x', 18)}</button></div>
  <div class="modal-body">${body}</div>
  ${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
}
function confirmAction(title, msg, onOk, okLabel = 'ยืนยัน') {
  openModal(modalShell(title, `<div class="confirm-msg">${msg}</div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
     <button class="btn btn-danger" id="confirm-ok">${okLabel}</button>`));
  document.getElementById('confirm-ok').onclick = () => { closeModal(); onOk && onOk(); };
}

/* ---------- แบดจ์ ---------- */
function statusBadge(s) {
  if (s === 'out') return '<span class="badge badge-danger"><span class="badge-dot out"></span>หมดคลัง</span>';
  if (s === 'low') return '<span class="badge badge-warning"><span class="badge-dot low"></span>ใกล้หมด</span>';
  return '<span class="badge badge-success"><span class="badge-dot ok"></span>เพียงพอ</span>';
}
function roleBadge(r) {
  return r === 'admin'
    ? '<span class="badge badge-primary">ผู้ดูแลระบบ</span>'
    : '<span class="badge badge-gray">เจ้าหน้าที่</span>';
}
function typeBadge(t) {
  return t === 'receive'
    ? '<span class="badge badge-receive">รับเข้า</span>'
    : '<span class="badge badge-issue">จำหน่าย</span>';
}
