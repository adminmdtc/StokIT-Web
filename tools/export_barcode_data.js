const fs = require('fs');
const { default: MDBReader } = require('mdb-reader');
const iconv = require('iconv-lite');

const mdbPath = String.raw`D:\StokIT\temp_mdb\maindata.mdb`;
const buf = fs.readFileSync(mdbPath);
const db = new MDBReader(buf);

// Read autolist table (barcode/product data)
const table = db.getTable('autolist');
const cols = table.getColumnNames();
const data = table.getData();

console.log(`autolist: ${data.length} rows, columns: ${cols.join(', ')}`);

// Convert TIS-620/Windows-874 encoded string to Unicode
function decodeThai(val) {
  if (!val) return '';
  if (val instanceof Buffer) {
    return iconv.decode(val, 'windows-874');
  }
  // If string, it was read as latin1, convert back to bytes then decode
  const bytes = Buffer.from(String(val), 'latin1');
  return iconv.decode(bytes, 'windows-874');
}

// Convert and export
const items = [];
for (let i = 0; i < data.length; i++) {
  const row = data[i];
  const code = decodeThai(row.code);
  const name = decodeThai(row.Lname);
  const type = decodeThai(row.Ltype);
  
  if (code && name) {
    items.push({
      id: row.id,
      code: code.trim(),
      name: name.trim(),
      type: type.trim()
    });
  }
}

console.log(`\nExported ${items.length} items`);
console.log('\nSample items:');
for (let i = 0; i < Math.min(10, items.length); i++) {
  console.log(`  ${items[i].code} | ${items[i].name} | [${items[i].type}]`);
}

// Count by type
const typeCounts = {};
for (const item of items) {
  const t = item.type || '(ไม่มีหมวด)';
  typeCounts[t] = (typeCounts[t] || 0) + 1;
}
console.log('\nBy type:');
for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${t}: ${c}`);
}

// Save as JSON with UTF-8
fs.writeFileSync('D:/StokIT/temp_barcode_data.json', JSON.stringify(items, null, 2), 'utf8');
console.log(`\nSaved to D:/StokIT/temp_barcode_data.json`);
