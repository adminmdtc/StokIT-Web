const fs = require('fs');
const { default: MDBReader } = require('mdb-reader');
const iconv = require('iconv-lite');

const mdbPath = String.raw`D:\StokIT\temp_mdb\maindata.mdb`;
const buf = fs.readFileSync(mdbPath);
const db = new MDBReader(buf);

const table = db.getTable('autolist');
const data = table.getData();

function decodeThai(val) {
  if (!val) return '';
  if (val instanceof Buffer) return iconv.decode(val, 'windows-874');
  const bytes = Buffer.from(String(val), 'latin1');
  return iconv.decode(bytes, 'windows-874');
}

// Analyze data quality
const items = [];
let emptyCode = 0, emptyName = 0, validItems = 0;
const types = {};
const codes = new Set();

for (const row of data) {
  const code = (decodeThai(row.code) || '').trim();
  const name = (decodeThai(row.Lname) || '').trim();
  const type = (decodeThai(row.Ltype) || '').trim();
  
  if (!code) { emptyCode++; continue; }
  if (!name) { emptyName++; continue; }
  
  codes.add(code);
  types[type || '(ไม่มี)'] = (types[type || '(ไม่มี)'] || 0) + 1;
  validItems++;
  
  if (validItems <= 5) {
    items.push({ code, name, type });
  }
}

console.log('=== วิเคราะห์คุณภาพข้อมูล autolist ===');
console.log(`รายการทั้งหมด: ${data.length}`);
console.log(`รายการที่มี code+name ครบ: ${validItems}`);
console.log(`รหัสซ้ำ (unique codes): ${codes.size}`);
console.log(`ไม่มีรหัส: ${emptyCode}`);
console.log(`ไม่มีชื่อ: ${emptyName}`);

console.log('\n=== ตัวอย่างข้อมูล (5 รายการแรก) ===');
for (const item of items) {
  console.log(`  ${item.code} | ${item.name} | [${item.type}]`);
}

console.log('\n=== หมวดหมู่/หน่วย (Top 15) ===');
for (const [t, c] of Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${t}: ${c} รายการ`);
}

// Check if data looks like IT supplies or auto parts
const keywords = {
  'อะไหล่': 0, 'ชิ้นส่วน': 0, 'มอเตอร์': 0, 'ฮอนด้า': 0, 'รถ': 0,
  'น้ำมัน': 0, 'หลอดไฟ': 0, 'ถ่าน': 0, 'กระดาษ': 0, 'หมึก': 0,
  'อะไหล่รถ': 0, 'CAR': 0, ' MOTOR': 0,
};
for (const row of data) {
  const name = decodeThai(row.Lname) || '';
  for (const kw of Object.keys(keywords)) {
    if (name.toUpperCase().includes(kw.toUpperCase())) keywords[kw]++;
  }
}
console.log('\n=== ตรวจสอบว่าเป็นสินค้าประเภทไหน ===');
for (const [kw, c] of Object.entries(keywords)) {
  if (c > 0) console.log(`  "${kw}": ${c} รายการ`);
}

// Check IT Stock existing items
const storePath = String.raw`D:\StokIT\temp_mdb\it_stock_sample.json`;
let existingItems = [];
try {
  // Check seed data
  const storeBuf = fs.readFileSync(String.raw`D:\StokIT\js\store.js`, 'utf8');
  // Count seed items
  const nameMatches = storeBuf.match(/name:\s*["'`]/g);
  console.log(`\n=== IT Stock ข้อมูลปัจจุบัน ===`);
  console.log(`seed data items (approx): ${nameMatches ? nameMatches.length : 0}`);
} catch(e) {}
