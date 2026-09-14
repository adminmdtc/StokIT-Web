'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const DB_DIR = app.getPath('userData');
const DB_PATH = path.join(DB_DIR, 'itstock.db');

let db;

function open() {
  if (db) return db;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      code TEXT DEFAULT '',
      name TEXT DEFAULT '',
      category TEXT DEFAULT '',
      unit TEXT DEFAULT '',
      minStock INTEGER DEFAULT 0,
      trackSerial INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      groupWork TEXT DEFAULT '',
      mission TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT DEFAULT '',
      no TEXT DEFAULT '',
      date TEXT DEFAULT '',
      party TEXT DEFAULT '',
      receiver TEXT DEFAULT '',
      partyRx TEXT DEFAULT '',
      note TEXT DEFAULT '',
      by TEXT DEFAULT '',
      byName TEXT DEFAULT '',
      mission TEXT DEFAULT '',
      group TEXT DEFAULT '',
      workUnit TEXT DEFAULT '',
      items TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT DEFAULT '',
      name TEXT DEFAULT '',
      password TEXT DEFAULT '',
      role TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS reorder_items (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      category TEXT DEFAULT '',
      qty INTEGER DEFAULT 1,
      unit TEXT DEFAULT '',
      createdAt TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);
}

/* ==================== CRUD ==================== */

function getAll(table) {
  open();
  return db.prepare(`SELECT * FROM [${table}]`).all();
}

function getById(table, id) {
  open();
  return db.prepare(`SELECT * FROM [${table}] WHERE id = ?`).get(id);
}

function upsert(table, row) {
  open();
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter(c => c !== 'id').map(c => `[${c}] = excluded.[${c}]`).join(', ');
  const sql = `INSERT INTO [${table}] (${cols.map(c => `[${c}]`).join(', ')}) VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates}`;
  db.prepare(sql).run(...cols.map(c => row[c]));
}

function insert(table, row) {
  open();
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const sql = `INSERT INTO [${table}] (${cols.map(c => `[${c}]`).join(', ')}) VALUES (${placeholders})`;
  db.prepare(sql).run(...cols.map(c => row[c]));
}

function update(table, id, row) {
  open();
  const cols = Object.keys(row).filter(c => c !== 'id');
  if (!cols.length) return;
  const sets = cols.map(c => `[${c}] = ?`).join(', ');
  db.prepare(`UPDATE [${table}] SET ${sets} WHERE id = ?`).run(...cols.map(c => row[c]), id);
}

function remove(table, id) {
  open();
  db.prepare(`DELETE FROM [${table}] WHERE id = ?`).run(id);
}

function clearTable(table) {
  open();
  db.prepare(`DELETE FROM [${table}]`).run();
}

function getMeta(key) {
  open();
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  open();
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(key, value);
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = {
  open, close, DB_PATH,
  getAll, getById, upsert, insert, update, remove, clearTable,
  getMeta, setMeta,
};
