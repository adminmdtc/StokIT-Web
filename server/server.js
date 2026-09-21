'use strict';

const express = require('express');
const cors = require('cors');
const { query, queryOne, getConfig, setConfig, testConfig, ensureSchema } = require('./db');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3333;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ============================================================
// Health Check
// ============================================================
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: 'mysql' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// Database config (หน้าต่าง "ตั้งค่าฐานข้อมูล")
// ============================================================

/* แปลง error ของ MySQL เป็นข้อความที่อ่านง่าย */
function dbErr(e) {
  const code = e.code || '';
  const map = {
    ECONNREFUSED: 'เชื่อมต่อ MySQL ไม่ได้ — ตรวจสอบว่า MySQL Server รันอยู่ที่ host/พอร์ตนี้',
    ER_ACCESS_DENIED_ERROR: 'ชื่อผู้ใช้หรือรหัสผ่าน MySQL ไม่ถูกต้อง',
    ER_BAD_DB_ERROR: 'ไม่พบฐานข้อมูลนี้ — กด "สร้างฐานข้อมูลใหม่" ก่อน',
    ETIMEDOUT: 'หมดเวลาเชื่อมต่อ — ตรวจสอบไฟร์วอลล์/IP',
    ENOTFOUND: 'ไม่พบ host ที่ระบุ',
  };
  if (map[code]) return code + ': ' + map[code];
  return code ? code + ': ' + (e.message || '') : (e.message || 'เชื่อมต่อไม่สำเร็จ');
}

/* GET — ค่าปัจจุบัน (ไม่ส่งรหัสผ่านกลับ) */
app.get('/api/db/config', (req, res) => {
  res.json(Object.assign(getConfig(), { running: true }));
});

/* POST — ทดสอบค่าที่กรอก (ยังไม่บันทึก) */
app.post('/api/db/test', async (req, res) => {
  try {
    const c = await testConfig(req.body || {});
    res.json({ ok: true, host: c.host, database: c.database });
  } catch (e) {
    res.json({ ok: false, error: dbErr(e) });
  }
});

/* POST — บันทึก config ใหม่ ใช้ได้ทันที ไม่ต้องรีสตาร์ท server */
app.post('/api/db/config', async (req, res) => {
  try {
    /* ถ้ากรอกรหัสผ่านว่างและเดิมมีรหัสผ่าน = คงรหัสผ่านเดิมไว้ */
    const body = Object.assign({}, req.body || {});
    if ((body.password === '' || body.password === undefined) && !body.keepPasswordSet) {
      delete body.password; /* ใช้รหัสผ่านที่บันทึกไว้แล้ว */
    }
    delete body.keepPasswordSet;
    const cfg = setConfig(body);
    /* ยืนยันว่าใช้งานได้จริง */
    await query('SELECT 1');
    res.json({ ok: true, host: cfg.host, database: cfg.database });
  } catch (e) {
    res.json({ ok: false, error: dbErr(e) });
  }
});

/* POST — สร้าง database + ตารางทั้งหมด (ปุ่ม "สร้างฐานข้อมูลใหม่") */
app.post('/api/db/setup', async (req, res) => {
  try {
    await ensureSchema();
    await query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: dbErr(e) });
  }
});

// ============================================================
// Items (อุปกรณ์/วัสดุ)
// ============================================================
app.get('/api/items', async (req, res) => {
  const rows = await query('SELECT * FROM items ORDER BY code');
  res.json(rows);
});

app.post('/api/items', async (req, res) => {
  const d = req.body;
  await query(
    'INSERT INTO items (id, code, name, category, unit, minStock, location, mission, `group`, workUnit, note, image, trackSerial, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), category=VALUES(category), unit=VALUES(unit), minStock=VALUES(minStock), location=VALUES(location), mission=VALUES(mission), `group`=VALUES(`group`), workUnit=VALUES(workUnit), note=VALUES(note), image=VALUES(image), trackSerial=VALUES(trackSerial), updatedAt=VALUES(updatedAt)',
    [d.id, d.code, d.name, d.category || '', d.unit || '', d.minStock || 0, d.location || '', d.mission || '', d.group || '', d.workUnit || '', d.note || '', d.image || '', d.trackSerial ? 1 : 0, d.updatedAt || Date.now()]
  );
  res.json({ ok: true, id: d.id });
});

app.put('/api/items/:id', async (req, res) => {
  const d = req.body;
  const fields = [];
  const vals = [];
  ['code','name','category','unit','minStock','location','mission','group','workUnit','note','image','trackSerial','updatedAt','updatedBy'].forEach(k => {
    if (d[k] !== undefined) {
      fields.push(k === 'group' ? '`group`' : k);
      vals.push(k === 'trackSerial' ? (d[k] ? 1 : 0) : d[k]);
    }
  });
  if (fields.length) {
    vals.push(req.params.id);
    await query(`UPDATE items SET ${fields.map(f => f + ' = ?').join(', ')} WHERE id = ?`, vals);
  }
  res.json({ ok: true });
});

app.delete('/api/items/:id', async (req, res) => {
  await query('DELETE FROM items WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// Transactions (รับเข้า/เบิกจ่าย)
// ============================================================
app.get('/api/transactions', async (req, res) => {
  const rows = await query('SELECT * FROM transactions ORDER BY id DESC');
  // Parse JSON items
  rows.forEach(r => {
    if (typeof r.items === 'string') r.items = JSON.parse(r.items);
  });
  res.json(rows);
});

app.post('/api/transactions', async (req, res) => {
  const d = req.body;
  await query(
    'INSERT INTO transactions (id, type, no, date, party, receiver, partyRx, note, `by`, byName, mission, `group`, workUnit, items, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE type=VALUES(type), no=VALUES(no), date=VALUES(date), party=VALUES(party), receiver=VALUES(receiver), partyRx=VALUES(partyRx), note=VALUES(note), `by`=VALUES(`by`), byName=VALUES(byName), mission=VALUES(mission), `group`=VALUES(`group`), workUnit=VALUES(workUnit), items=VALUES(items), updatedAt=VALUES(updatedAt)',
    [d.id, d.type, d.no, d.date, d.party || '', d.receiver || '', d.partyRx || '', d.note || '', d.by || '', d.byName || '', d.mission || '', d.group || '', d.workUnit || '', JSON.stringify(d.items || []), d.updatedAt || Date.now()]
  );
  res.json({ ok: true, id: d.id });
});

app.delete('/api/transactions/:id', async (req, res) => {
  await query('DELETE FROM transactions WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// Users (ผู้ใช้งาน)
// ============================================================
app.get('/api/users', async (req, res) => {
  const rows = await query('SELECT * FROM users ORDER BY username');
  res.json(rows);
});

app.post('/api/users', async (req, res) => {
  const d = req.body;
  await query(
    'INSERT INTO users (id, username, password, name, role, updatedAt) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=VALUES(username), password=VALUES(password), name=VALUES(name), role=VALUES(role), updatedAt=VALUES(updatedAt)',
    [d.id, d.username, d.password, d.name, d.role || 'user', d.updatedAt || Date.now()]
  );
  res.json({ ok: true, id: d.id });
});

app.put('/api/users/:id', async (req, res) => {
  const d = req.body;
  const fields = [];
  const vals = [];
  ['username','password','name','role','updatedAt'].forEach(k => {
    if (d[k] !== undefined) { fields.push(k); vals.push(d[k]); }
  });
  if (fields.length) {
    vals.push(req.params.id);
    await query(`UPDATE users SET ${fields.map(f => f + ' = ?').join(', ')} WHERE id = ?`, vals);
  }
  res.json({ ok: true });
});

app.delete('/api/users/:id', async (req, res) => {
  await query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// Reorder Items (รายการต้องสั่งเพิ่ม)
// ============================================================
app.get('/api/reorder', async (req, res) => {
  const rows = await query('SELECT * FROM reorder_items ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/reorder', async (req, res) => {
  const d = req.body;
  await query(
    'INSERT INTO reorder_items (id, itemId, itemName, category, qty, unit, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE itemId=VALUES(itemId), itemName=VALUES(itemName), category=VALUES(category), qty=VALUES(qty), unit=VALUES(unit), note=VALUES(note), updatedAt=VALUES(updatedAt)',
    [d.id, d.itemId || '', d.itemName || '', d.category || '', d.qty || 0, d.unit || '', d.note || '', d.updatedAt || Date.now()]
  );
  res.json({ ok: true, id: d.id });
});

app.delete('/api/reorder/:id', async (req, res) => {
  await query('DELETE FROM reorder_items WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/reorder', async (req, res) => {
  await query('DELETE FROM reorder_items');
  res.json({ ok: true });
});

// ============================================================
// Sequences (ลำดับเลขที่เอกสาร)
// ============================================================
app.get('/api/seq/:name', async (req, res) => {
  const row = await queryOne('SELECT value FROM sequences WHERE name = ?', [req.params.name]);
  res.json({ value: row ? row.value : 0 });
});

app.put('/api/seq/:name', async (req, res) => {
  await query(
    'INSERT INTO sequences (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
    [req.params.name, req.body.value, req.body.value]
  );
  res.json({ ok: true });
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 IT Stock Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`📱 โทรศัพท์: http://192.168.10.122:${PORT}/api`);
});
