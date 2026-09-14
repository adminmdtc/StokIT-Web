-- ============================================================
-- IT Stock — MySQL Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS it_stock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE it_stock;

-- ตารางอุปกรณ์/วัสดุ
CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(50) PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) DEFAULT '',
  unit VARCHAR(50) DEFAULT '',
  minStock INT DEFAULT 0,
  location VARCHAR(255) DEFAULT '',
  mission VARCHAR(10) DEFAULT '',
  `group` VARCHAR(10) DEFAULT '',
  workUnit VARCHAR(100) DEFAULT '',
  note TEXT,
  image TEXT,
  trackSerial TINYINT(1) DEFAULT 0,
  updatedAt BIGINT DEFAULT 0,
  updatedBy VARCHAR(50) DEFAULT ''
);

-- ตารางรายการรับเข้า/เบิกจ่าย
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(50) PRIMARY KEY,
  type ENUM('receive','issue') NOT NULL,
  no VARCHAR(30) NOT NULL,
  date DATE NOT NULL,
  party VARCHAR(255) DEFAULT '',
  receiver VARCHAR(255) DEFAULT '',
  partyRx VARCHAR(255) DEFAULT '',
  note TEXT,
  `by` VARCHAR(50) DEFAULT '',
  `byName` VARCHAR(255) DEFAULT '',
  mission VARCHAR(10) DEFAULT '',
  `group` VARCHAR(10) DEFAULT '',
  workUnit VARCHAR(100) DEFAULT '',
  items JSON NOT NULL,
  updatedAt BIGINT DEFAULT 0,
  updatedBy VARCHAR(50) DEFAULT ''
);

-- ตารางผู้ใช้งาน
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin','user') DEFAULT 'user',
  updatedAt BIGINT DEFAULT 0,
  updatedBy VARCHAR(50) DEFAULT ''
);

-- ตารางรายการต้องสั่งเพิ่ม
CREATE TABLE IF NOT EXISTS reorder_items (
  id VARCHAR(50) PRIMARY KEY,
  itemId VARCHAR(50) DEFAULT '',
  itemName VARCHAR(255) DEFAULT '',
  category VARCHAR(100) DEFAULT '',
  qty INT DEFAULT 0,
  unit VARCHAR(50) DEFAULT '',
  note TEXT DEFAULT '',
  updatedAt BIGINT DEFAULT 0,
  updatedBy VARCHAR(50) DEFAULT ''
);

-- ตาราง sequence สำหรับเลขที่เอกสาร
CREATE TABLE IF NOT EXISTS sequences (
  name VARCHAR(30) PRIMARY KEY,
  value INT DEFAULT 0
);

-- Insert default sequences
INSERT IGNORE INTO sequences (name, value) VALUES ('item', 49), ('receive', 0), ('issue', 0);

-- Indexes
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_group ON items(`group`);
CREATE INDEX idx_items_mission ON items(mission);
CREATE INDEX idx_tx_type ON transactions(type);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_no ON transactions(no);
