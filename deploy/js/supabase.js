'use strict';

/* ============================================================
   SupabaseBackend — ตัวเชื่อมต่อฐานข้อมูลคลาวด์ Supabase (ฟรี)
   ใช้ Supabase REST API (PostgREST) โดยตรง — ไม่ต้องโหลดไลบรารีเพิ่ม
   โครงสร้างตาราง: ทุกตารางเก็บข้อมูลเป็น JSON (data jsonb) เหมือน
   ไฟล์ backup ของแอปเป๊ะ ๆ → ไม่มีปัญหา field ไม่ตรง
   ตาราง: it_items / it_transactions / it_users / it_reorder / it_meta
   สร้างตาราง: ดูคู่มือ docs/supabase-setup.md (วาง SQL ใน Supabase SQL Editor)
   ============================================================ */

const SB_URL_KEY = 'it_stock_supabase_url';
const SB_KEY_STORE = 'it_stock_supabase_key';
const SB_ENABLED_KEY = 'it_stock_supabase_enabled';

const SupabaseBackend = {
  enabled: false,
  url: '',
  key: '',

  init() {
    this.url = (localStorage.getItem(SB_URL_KEY) || '').replace(/\/+$/, '');
    this.key = localStorage.getItem(SB_KEY_STORE) || '';
    this.enabled = !!(this.url && this.key && localStorage.getItem(SB_ENABLED_KEY));
  },

  setUrl(url) {
    this.url = String(url || '').trim().replace(/\/+$/, '');
    if (this.url) localStorage.setItem(SB_URL_KEY, this.url);
  },

  setKey(key) {
    this.key = String(key || '').trim();
    if (this.key) localStorage.setItem(SB_KEY_STORE, this.key);
  },

  setEnabled(v) {
    this.enabled = !!v && !!(this.url && this.key);
    if (this.enabled) localStorage.setItem(SB_ENABLED_KEY, '1');
    else localStorage.removeItem(SB_ENABLED_KEY);
    /* เริ่ม/หยุด Realtime ให้หน้าจออัปเดตสด */
    if (typeof LiveSync !== 'undefined') {
      if (this.enabled) LiveSync.start();
      else LiveSync.stop();
    }
  },

  /* แปลง error จาก Supabase เป็นข้อความไทยที่เข้าใจง่าย */
  _thaiError(status, body) {
    const msg = (body && (body.message || body.error_description || body.error)) || '';
    if (status === 401 || status === 403) return 'API key ไม่ถูกต้อง (key ที่ส่งไป: ' + String(this.key || '').slice(0, 8) + '...' + String(this.key || '').slice(-4) + ' ยาว ' + String(this.key || '').length + ' ตัว) — ลองคัดลอก key ใหม่จากหน้า Connect ของ Supabase';
    if (status === 404 || /relation .* does not exist|does not exist/i.test(msg)) return 'ยังไม่ได้สร้างตารางใน Supabase — กดปุ่ม "ดู SQL สร้างตาราง" แล้ววางใน SQL Editor ก่อน';
    if (status === 400 && /jwt|apikey/i.test(msg)) return 'API key รูปแบบไม่ถูกต้อง';
    if (status === 42501 || /row-level security|permission denied/i.test(msg)) return 'ตารางยังไม่เปิดสิทธิ์ — รันคำสั่ง CREATE POLICY จากคู่มือด้วย';
    if (status >= 500) return 'Supabase ไม่ตอบสนอง (' + status + ') — ตรวจสอบว่า URL project ถูกต้อง (ดูที่ supabase.com → Project Settings → API)';
    return msg || ('HTTP ' + status);
  },

  async _rest(path, opts = {}) {
    if (!this.url || !this.key) throw new Error('กรุณากรอก URL และ anon key ของ Supabase ก่อน');
    let resp;
    try {
      resp = await fetch(this.url + path, Object.assign({
        headers: Object.assign({
          'apikey': this.key,
          'Authorization': 'Bearer ' + this.key,
          'Content-Type': 'application/json',
        }, opts.headers || {}),
      }, opts));
    } catch (e) {
      throw new Error('ติดต่อ Supabase ไม่ได้ — ตรวจสอบ URL project (ต้องขึ้นต้น https://xxxx.supabase.co)');
    }
    if (!resp.ok) {
      let body = null;
      try { body = await resp.json(); } catch (e) { /* ignore */ }
      throw new Error(this._thaiError(resp.status, body));
    }
    if (resp.status === 204) return null;
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  },

  _table(t) { return '/rest/v1/' + t + '?select=id,data'; },

  /* ---- ทดสอบการเชื่อมต่อ (ยังไม่บันทึก) ---- */
  async testConnection() {
    try {
      const rows = await this._rest(this._table('it_meta') + '&limit=1');
      return { ok: true, empty: !rows || !rows.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /* ---- ดึงข้อมูลทั้งหมดจากคลาวด์ ---- */
  async pullAll() {
    const [items, transactions, users, reorder, meta] = await Promise.all([
      this._rest(this._table('it_items')),
      this._rest(this._table('it_transactions')),
      this._rest(this._table('it_users')),
      this._rest(this._table('it_reorder')).catch(() => []),
      this._rest(this._table('it_meta')).catch(() => []),
    ]);
    const seqRow = (meta || []).find(r => r.id === 'seq');
    const revRow = (meta || []).find(r => r.id === 'rev');
    return {
      items: (items || []).map(r => r.data),
      transactions: (transactions || []).map(r => r.data),
      users: (users || []).map(r => r.data),
      reorderItems: (reorder || []).map(r => r.data),
      seq: seqRow ? seqRow.data : null,
      rev: revRow ? (revRow.data && revRow.data.n || 0) : 0,
    };
  },

  /* ---- อัปโหลดข้อมูลทั้งหมดขึ้นคลาวด์ (upsert ตาม id) ---- */
  async _upsert(table, rows) {
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await this._rest('/rest/v1/' + table, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows.slice(i, i + CHUNK)),
      });
    }
  },

  _rows(list) {
    return (list || []).map(x => ({ id: x.id, data: x, updated_at: x.updatedAt || Date.now() }));
  },

  async pushAll(db) {
    await this._upsert('it_items', this._rows(db.items));
    await this._upsert('it_transactions', this._rows(db.transactions));
    await this._upsert('it_users', this._rows(db.users));
    if (db.reorderItems && db.reorderItems.length) await this._upsert('it_reorder', this._rows(db.reorderItems));
    if (db.seq) await this._upsert('it_meta', [{ id: 'seq', data: db.seq, updated_at: Date.now() }]);
    return (db.items || []).length + (db.transactions || []).length + (db.users || []).length;
  },

  /* ---- เพิ่ม/แก้ไข/ลบ รายการเดี่ยว (ใช้ตอนซิงค์อัตโนมัติ) ---- */
  async _upsertOne(table, rec) {
    await this._upsert(table, [{ id: rec.id, data: rec, updated_at: rec.updatedAt || Date.now() }]);
  },

  async _mergeUpdate(table, id, patch) {
    /* ดึงข้อมูลเดิมมารวมกับ field ที่แก้ แล้วอัปเดตทั้งก้อน */
    const rows = await this._rest('/rest/v1/' + table + '?select=id,data&id=eq.' + encodeURIComponent(id));
    if (!rows || !rows.length) { await this._upsertOne(table, Object.assign({ id }, patch)); return; }
    const merged = Object.assign({}, rows[0].data, patch, { id });
    await this._upsertOne(table, merged);
  },

  async _del(table, id) {
    await this._rest('/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
  },

  addItem(d) { return this._upsertOne('it_items', d); },
  updateItem(id, d) { return this._mergeUpdate('it_items', id, d); },
  deleteItem(id) { return this._del('it_items', id); },

  addTransaction(d) { return this._upsertOne('it_transactions', d); },
  deleteTransaction(id) { return this._del('it_transactions', id); },

  addUser(d) { return this._upsertOne('it_users', d); },
  updateUser(id, d) { return this._mergeUpdate('it_users', id, d); },
  deleteUser(id) { return this._del('it_users', id); },

  addReorder(d) { return this._upsertOne('it_reorder', d); },
  deleteReorder(id) { return this._del('it_reorder', id); },
  async clearReorderAll() {
    await this._rest('/rest/v1/it_reorder?id=neq.' + encodeURIComponent('\u0000'), { method: 'DELETE' });
  },

  /* บันทึกตัวนับเลขที่เอกสาร (seq) */
  async saveSeq(seq) { return this._upsert('it_meta', [{ id: 'seq', data: seq, updated_at: Date.now() }]); },

  /* ---- revision counter: ขยับทุกครั้งที่มี "การเขียนทับทั้งชุด" (restore backup)
     เครื่องอื่นเห็น rev ใหม่กว่าที่ตัวเองเคยเห็น = ต้อง replace เต็ม ไม่ใช่ merge
     (กันข้อมูลที่เครื่องอื่นเพิ่งลบไป ฟื้นกลับมาเพราะ merge เก็บรายการ local ไว้) ---- */
  async getRev() {
    try {
      const rows = await this._rest(this._table('it_meta') + '&id=eq.rev');
      return rows && rows.length ? (rows[0].data && rows[0].data.n || 0) : 0;
    } catch (e) { return 0; }
  },

  async bumpRev() {
    const n = (await this.getRev()) + 1;
    await this._upsert('it_meta', [{ id: 'rev', data: { n }, updated_at: Date.now() }]);
    return n;
  },

  /* เขียนทับคลาวด์ทั้งชุด (ใช้ตอนกู้คืน backup) — ลบของเก่าทั้งหมดก่อน push */
  async replaceAll(db) {
    await this._rest('/rest/v1/it_items?id=neq.' + encodeURIComponent('\u0000'), { method: 'DELETE' });
    await this._rest('/rest/v1/it_transactions?id=neq.' + encodeURIComponent('\u0000'), { method: 'DELETE' });
    await this._rest('/rest/v1/it_users?id=neq.' + encodeURIComponent('\u0000'), { method: 'DELETE' });
    await this._rest('/rest/v1/it_reorder?id=neq.' + encodeURIComponent('\u0000'), { method: 'DELETE' });
    await this.pushAll(db);
    return this.bumpRev();
  },

  /* ============================================================
     Realtime — ติดตามการเปลี่ยนแปลงจากผู้ใช้อื่นผ่าน PostgREST
     streaming (SSE). เมื่อตารางไหนมีการแก้ไข จะเรียก callback
     ({ table, event }) ให้แอปไปดึงข้อมูลล่าสุดและวาดหน้าจอใหม่
     หมายเหตุ: ต้องเปิด Realtime กับตารางใน Supabase ด้วย
     (SQL ที่ปุ่ม "ดู SQL สร้างตาราง" มีคำสั่ง alter publication ให้แล้ว)
     ============================================================ */
  _rtStream: null,
  _rtTables: ['it_items', 'it_transactions', 'it_users', 'it_reorder'],

  startRealtime(onChange) {
    this.stopRealtime();
    if (!this.url || !this.key || typeof onChange !== 'function') return;
    const topics = this._rtTables.map(t => 'realtime:public:' + t).join(',');
    const url = this.url + '/realtime/v1/stream?topics=' + encodeURIComponent(topics) + '&apikey=' + encodeURIComponent(this.key);
    let es;
    try { es = new EventSource(url); } catch (e) { console.error('Realtime open error:', e); return; }
    this._rtStream = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const topic = msg.topic || '';
        const table = topic.split(':').pop();
        if (this._rtTables.includes(table)) onChange({ table, event: (msg.event || 'UPDATE'), commit: msg.commit_timestamp || null });
      } catch (e) { /* ข้อความที่ parse ไม่ได้ ข้าม */ }
    };
    es.onerror = () => { /* EventSource reconnect เอง */ };
  },

  stopRealtime() {
    if (this._rtStream) {
      try { this._rtStream.close(); } catch (e) { /* ignore */ }
      this._rtStream = null;
    }
  },
};

SupabaseBackend.init();
