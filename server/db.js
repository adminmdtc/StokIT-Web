'use strict';

/* ============================================================
   MySQL connection — runtime-switchable config
   ค่า config เก็บใน server/db-config.json (กด "บันทึก" จากหน้า
   ตั้งค่าฐานข้อมูลในแอป แล้วใช้ได้เลย ไม่ต้องรีสตาร์ท server)
   ============================================================ */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const CONFIG_FILE = path.join(__dirname, 'db-config.json');

/* ค่าเริ่มต้น (env ยังใช้ได้เหมือนเดิม) */
function defaultConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'it_stock',
  };
}

/* โหลด config ที่บันทึกไว้จากหน้าตั้งค่า */
function loadConfig() {
  const def = defaultConfig();
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return Object.assign(def, saved);
  } catch (e) {
    return def;
  }
}

let cfg = loadConfig();
let pool = null;

/* pool ที่สร้างด้วย config เก่าต้องทิ้งก่อนสร้างใหม่ */
function resetPool() {
  if (pool) { pool.end().catch(() => {}); pool = null; }
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(Object.assign({}, cfg, {
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
    }));
  }
  return pool;
}

function getConfig() {
  /* ซ่อนรหัสผ่านตอนส่งกลับไปหน้าเว็บ */
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    database: cfg.database,
    hasPassword: !!cfg.password,
    configFile: CONFIG_FILE,
  };
}

/* ตั้งค่าใหม่จากหน้าเว็บ — ทดสอบก่อน (ถ้าสั่ง) แล้วบันทึกลงไฟล์ */
function setConfig(partial) {
  const next = Object.assign({}, cfg, partial || {});
  next.port = parseInt(next.port || '3306', 10);
  cfg = next;
  resetPool();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (e) { /* อ่านอย่างเดียวก็ยังใช้ได้ใน session นี้ */ }
  return cfg;
}

/* ทดสอบว่าเชื่อมต่อได้จริงด้วย config ที่ให้มา (ยังไม่บันทึก) */
async function testConfig(partial) {
  const c = Object.assign({}, cfg, partial || {});
  const conn = await mysql.createConnection({
    host: c.host, port: parseInt(c.port || '3306', 10),
    user: c.user, password: c.password,
  });
  await conn.ping();
  await conn.end();
  return c;
}

/* สร้าง database + ตารางทั้งหมดจาก sql/schema.sql (ปุ่ม "สร้างฐานข้อมูลใหม่") */
async function ensureSchema() {
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
    multipleStatements: true,
  });
  await conn.query('CREATE DATABASE IF NOT EXISTS `' + cfg.database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.query('USE `' + cfg.database + '`');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const statements = schema
    .split(';')
    .map(s => s.replace(/--.*$/gm, '').trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    try { await conn.query(stmt); } catch (e) {
      if (e.code !== 'ER_TABLE_EXISTS_ERROR' && e.code !== 'ER_DUP_ENTRY') console.warn('⚠️ schema:', e.message.substring(0, 80));
    }
  }
  await conn.end();
  resetPool();
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = { getPool, query, queryOne, get DB_CONFIG() { return cfg; }, getConfig, setConfig, testConfig, ensureSchema };
