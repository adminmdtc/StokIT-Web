'use strict';

const express = require('express');
const cors = require('cors');
const { query, queryOne } = require('./db');

const app = express();
const PORT = process.env.PORT || 3333;

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
