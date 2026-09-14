'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  charset: 'utf8mb4',
};

async function setup() {
  console.log('🔧 กำลังตั้งค่าฐานข้อมูล MySQL...\n');

  // เชื่อมต่อ MySQL (ไม่ระบุ database)
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log('✅ เชื่อมต่อ MySQL สำเร็จ\n');

  // อ่านไฟล์ schema
  const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // แยกคำสั่ง SQL (ตัด comment ออก)
  const statements = schema
    .split(';')
    .map(s => s.replace(/--.*$/gm, '').trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
    } catch (e) {
      // Skip duplicate errors
      if (e.code !== 'ER_DUP_ENTRY') {
        console.log('⚠️ ', e.message.substring(0, 80));
      }
    }
  }

  console.log('✅ สร้างตารางสำเร็จ\n');

  // แสดงตาราง
  const [tables] = await conn.execute("SHOW TABLES FROM it_stock");
  console.log('📋 ตารางในระบบ:');
  tables.forEach(t => {
    const name = Object.values(t)[0];
    console.log(`   • ${name}`);
  });

  await conn.end();
  console.log('\n🎉 ตั้งค่าเสร็จสิ้น — พร้อมใช้งาน!');
}

setup().catch(err => {
  console.error('❌ เกิดข้อผิดพลาด:', err.message);
  if (err.code === 'ECONNREFUSED') {
    console.error('\n💡 กรุณาตรวจสอบว่า MySQL Server กำลังทำงานอยู่');
    console.error('   - Windows: ไปที่ Services → MySQL → Start');
    console.error('   - หรือรัน: net start MySQL80');
  }
  process.exit(1);
});
