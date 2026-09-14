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

// Collect all unique item names (first 500 chars) to understand what's in the DB
const sampleNames = [];
const allNames = [];

for (let i = 0; i < data.length; i++) {
  const name = (decodeThai(data[i].Lname) || '').trim();
  const code = (decodeThai(data[i].code) || '').trim();
  const type = (decodeThai(data[i].Ltype) || '').trim();
  
  if (name && code) {
    allNames.push({ code, name, type });
  }
}

// Show diverse samples - pick from different positions
console.log('=== ตัวอย่างข้อมูล 30 รายการ (จากตำแหน่งต่างๆ) ===');
const positions = [0, 100, 500, 1000, 2000, 5000, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000, 130000, 140000, 150000, 160000, 170000, 180000, 190000, 195000, 197000];
for (const pos of positions) {
  if (pos < allNames.length) {
    const item = allNames[pos];
    console.log(`[${pos}] ${item.code} | ${item.name} | [${item.type}]`);
  }
}

// Check if any items look like IT supplies
const itKeywords = [
  'ตลับหมึก', 'toner', 'ink', 'cartridge', 'กระดาษ', 'paper',
  'สายไฟ', 'cable', 'plug', 'ปลั๊ก', 'ไฟฟ้า', 'computer',
  'คีย์บอร์ด', 'keyboard', 'เมาส์', 'mouse', 'จอ', 'monitor',
  'ปริ้นเตอร์', 'printer', 'ฮาร์ดดิส', 'harddisk', 'USB',
  'แฟลชไดรฟ์', 'flash', 'เน็ตเวิร์ค', 'network', 'เราท์เตอร์', 'router',
  'แบตเตอรี่', 'battery', 'ชาร์จ', 'charger', 'อุปกรณ์', 'device',
  'โทรศัพท์', 'phone', 'แอร์', 'air', 'พัดลม', 'fan',
  'หลอดไฟ', 'bulb', 'ไฟ', 'light', 'สวิตช์', 'switch',
  'บอร์ด', 'board', 'เมนบอร์ด', 'mainboard', 'แรม', 'ram',
  'SSD', 'HDD', 'CPU', 'LED', 'LCD', 'UPS',
];

console.log('\n=== ค้นหาสินค้าที่เกี่ยวกับ IT ===');
let itCount = 0;
const itItems = [];

for (const item of allNames) {
  const nameUpper = item.name.toUpperCase();
  for (const kw of itKeywords) {
    if (nameUpper.includes(kw.toUpperCase())) {
      itItems.push(item);
      itCount++;
      break;
    }
  }
}

console.log(`พบสินค้าที่เกี่ยวกับ IT: ${itCount} รายการ`);
for (let i = 0; i < Math.min(20, itItems.length); i++) {
  console.log(`  ${itItems[i].code} | ${itItems[i].name} | [${itItems[i].type}]`);
}

// Also check the type column - any IT categories?
console.log('\n=== หน่วยทั้งหมด ===');
const allTypes = {};
for (const item of allNames) {
  const t = item.type || '(ไม่มี)';
  allTypes[t] = (allTypes[t] || 0) + 1;
}
for (const [t, c] of Object.entries(allTypes).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${c}`);
}
