const fs = require('fs');
const { default: MDBReader } = require('mdb-reader');

const mdbPath = String.raw`D:\StokIT\temp_mdb\maindata.mdb`;
const buf = fs.readFileSync(mdbPath);
const db = new MDBReader(buf);

console.log('Tables:', db.getTableNames());

for (const tableName of db.getTableNames()) {
  const table = db.getTable(tableName);
  const cols = table.getColumnNames();
  const data = table.getData();
  console.log('\n--- ' + tableName + ' (' + data.length + ' rows) ---');
  console.log('Columns:', cols.join(', '));
  
  for (let i = 0; i < Math.min(3, data.length); i++) {
    const row = {};
    for (const col of cols) {
      let val = data[i][col];
      if (val !== null && val !== undefined) {
        if (val instanceof Buffer) val = '<Buffer ' + val.length + ' bytes>';
        else val = String(val).substring(0, 120);
      }
      row[col] = val;
    }
    console.log('  Row ' + i + ':', JSON.stringify(row));
  }
}
