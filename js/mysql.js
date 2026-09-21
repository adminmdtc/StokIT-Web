'use strict';

/* ============================================================
   MySQLBackend — ตัวเชื่อมต่อไปยัง IT Stock Server (server/server.js)
   หน้าต่าง "ตั้งค่าฐานข้อมูล" ในแอปใช้ client นี้บันทึก host/port/
   ผู้ใช้/รหัสผ่าน แล้วกดบันทึก — server จะเปลี่ยนไปใช้ MySQL ตัวใหม่ทันที
   ============================================================ */

const DB_CFG_KEY = 'it_stock_db_server_url';

const MySQLBackend = {
  enabled: false,
  url: '',

  init() {
    this.url = localStorage.getItem(DB_CFG_KEY) || 'http://localhost:3333';
    this.enabled = !!localStorage.getItem(DB_CFG_KEY + '.enabled');
  },

  setUrl(url) {
    this.url = url.replace(/\/+$/, '');
    localStorage.setItem(DB_CFG_KEY, this.url);
  },

  setEnabled(v) {
    this.enabled = !!v;
    if (v) localStorage.setItem(DB_CFG_KEY + '.enabled', '1');
    else localStorage.removeItem(DB_CFG_KEY + '.enabled');
  },

  async _fetch(path, opts = {}) {
    const resp = await fetch(this.url + path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, opts));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp.json();
  },

  async healthCheck() {
    try {
      const data = await this._fetch('/api/health');
      return !!(data && data.ok);
    } catch (e) { return false; }
  },

  /* ---- หน้าต่าง "ตั้งค่าฐานข้อมูล" ---- */

  /* ดึงค่า config ปัจจุบันของ server (ไม่มีรหัสผ่าน) */
  async getConfig() {
    return this._fetch('/api/db/config');
  },

  /* ทดสอบค่าที่กรอก (ยังไม่บันทึก) */
  async testDb(cfg) {
    return this._fetch('/api/db/test', { method: 'POST', body: JSON.stringify(cfg) });
  },

  /* บันทึก config — server เปลี่ยนฐานข้อมูลทันที */
  async saveConfig(cfg) {
    return this._fetch('/api/db/config', { method: 'POST', body: JSON.stringify(cfg) });
  },

  /* สร้าง database + ตารางทั้งหมด */
  async createSchema() {
    return this._fetch('/api/db/setup', { method: 'POST', body: '{}' });
  },

  /* ---- sync ข้อมูล ---- */

  async syncAll() {
    const [items, transactions, users, reorderItems] = await Promise.all([
      this._fetch('/api/items'),
      this._fetch('/api/transactions'),
      this._fetch('/api/users'),
      this._fetch('/api/reorder').catch(() => []),
    ]);
    return { items, transactions, users, reorderItems };
  },

  async addItem(d) { return this._fetch('/api/items', { method: 'POST', body: JSON.stringify(d) }); },
  async updateItem(id, d) { return this._fetch('/api/items/' + id, { method: 'PUT', body: JSON.stringify(d) }); },
  async deleteItem(id) { return this._fetch('/api/items/' + id, { method: 'DELETE' }); },

  async addTransaction(d) { return this._fetch('/api/transactions', { method: 'POST', body: JSON.stringify(d) }); },
  async deleteTransaction(id) { return this._fetch('/api/transactions/' + id, { method: 'DELETE' }); },

  async addUser(d) { return this._fetch('/api/users', { method: 'POST', body: JSON.stringify(d) }); },
  async updateUser(id, d) { return this._fetch('/api/users/' + id, { method: 'PUT', body: JSON.stringify(d) }); },
  async deleteUser(id) { return this._fetch('/api/users/' + id, { method: 'DELETE' }); },

  async addReorder(d) { return this._fetch('/api/reorder', { method: 'POST', body: JSON.stringify(d) }); },
  async deleteReorder(id) { return this._fetch('/api/reorder/' + id, { method: 'DELETE' }); },
};

MySQLBackend.init();
