const fs = require('fs');
const path = require('path');
const { default: MDBReader } = require('mdb-reader');

// Microsoft SZDD decompression (standard ring buffer algorithm)
function decompressSZDD(buf) {
  if (buf.toString('ascii', 0, 4) !== 'SZDD') throw new Error('Not SZDD');
  const uncompressedSize = buf.readUInt32LE(12);
  const data = buf.slice(16);
  
  // Ring buffer initialized with spaces (0x20)
  const N = 4096;
  const ringBuffer = Buffer.alloc(N, 0x20);
  let r = N - 18;  // initial ring buffer position
  const output = Buffer.alloc(uncompressedSize);
  let outPos = 0;
  let pos = 0;
  
  while (pos < data.length && outPos < uncompressedSize) {
    let flags = data[pos++];
    
    for (let i = 0; i < 8 && pos < data.length && outPos < uncompressedSize; i++) {
      if (flags & 1) {
        // Compressed: 2 bytes
        const lo = data[pos++];
        const hi = data[pos++];
        const offset = ((hi & 0xF0) << 4) | lo;
        let length = (hi & 0x0F) + 3;
        
        let s = (r + 1 + offset) & (N - 1);
        while (length-- > 0 && outPos < uncompressedSize) {
          const b = ringBuffer[s];
          output[outPos++] = b;
          ringBuffer[r] = b;
          r = (r + 1) & (N - 1);
          s = (s + 1) & (N - 1);
        }
      } else {
        // Literal byte
        const b = data[pos++];
        output[outPos++] = b;
        ringBuffer[r] = b;
        r = (r + 1) & (N - 1);
      }
      flags >>= 1;
    }
  }
  return output.slice(0, outPos);
}

const srcDir = String.raw`E:\2.ติดตั้งระบบโปรแกรม`;
const outDir = String.raw`D:\StokIT\temp_mdb`;

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const mdFiles = ['maindata.md_', 'ReportData.md_', 'adddisplay.md_'];

for (const f of mdFiles) {
  const srcPath = path.join(srcDir, f);
  const outPath = path.join(outDir, f.replace('.md_', '.mdb'));
  
  console.log(`\nDecompressing ${f}...`);
  const buf = fs.readFileSync(srcPath);
  console.log(`  Compressed: ${buf.length} bytes`);
  
  const mdb = decompressSZDD(buf);
  fs.writeFileSync(outPath, mdb);
  console.log(`  Decompressed: ${mdb.length} bytes`);
  console.log(`  Header: ${mdb.slice(0, 16).toString('hex')}`);
}

// Now read maindata.mdb
console.log('\n=== Reading maindata.mdb ===');
const dbBuf = fs.readFileSync(path.join(outDir, 'maindata.mdb'));
const db = new MDBReader(dbBuf);

console.log('Tables:', db.getTableNames());

for (const tableName of db.getTableNames()) {
  const table = db.getTable(tableName);
  const rows = table.getRecords();
  console.log('\n--- ' + tableName + ' (' + rows.length + ' rows) ---');
  
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    console.log('Columns:', cols.join(', '));
    
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = {};
      for (const col of cols) {
        let val = rows[i][col];
        if (val !== null && val !== undefined) {
          if (val instanceof Buffer) val = '<Buffer ' + val.length + ' bytes>';
          else val = String(val).substring(0, 120);
        }
        row[col] = val;
      }
      console.log('  Row ' + i + ':', JSON.stringify(row));
    }
  }
}
