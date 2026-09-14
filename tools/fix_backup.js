const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('C:/Users/piraphatCant1208/Downloads/รายงานคงเหลือวัสดุ_2026-08-20.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const excelData = XLSX.utils.sheet_to_json(ws);

const seedItems = [
  { id: 'i1', code: '8850816112044', name: 'แผ่นรองเมาส์ Oker', category: 'อุปกรณ์ต่อพ่วง', unit: 'แผ่น', mission: 'm1', group: 'g1' },
  { id: 'i2', code: '4977766786324', name: 'น้ำหมึกแบบขวด BT D60bk(สีดำ)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i3', code: '4977766748148', name: 'หมึกน้ำแบบขวด BT500m(สีแดง)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i4', code: '6942937504869', name: 'ตลับหมึกผง เทียบ35A', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i5', code: '8858835272046', name: 'แบบตรี่ เครื่องสำรองไฟ', category: 'อุปกรณ์ไฟฟ้า', unit: 'ก้อน', mission: 'm4', group: 'g12' },
  { id: 'i6', code: '6936358007061', name: 'ตลับหมึก pantum TL-410x', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i7', code: '4977766748155', name: 'น้ำหมึกแบบขวด BT5000y (สีเหลือง)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i8', code: '4549292041880', name: 'หมึกน้ำแบบขวด canon BK GI-790<BK>', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i9', code: '4977766748131', name: 'หมึกน้ำแบบขวด BT5000c(สีน้ำเงิน)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i10', code: '6936358057479', name: 'ดรั้ม pantum DL410', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i11', code: '4549292041927', name: 'หมึกน้ำแบบขวด canon M GI-790<M>', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i12', code: '4549292041941', name: 'หมึกน้ำแบบขวด canon Y GI-790<Y>', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i13', code: '4549292041903', name: 'หมึกน้ำแบบขวด canon C GI-790<C>', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i14', code: '4961311926631', name: 'ตลับหมึก RICOH SP230H', category: 'หมึกพิมพ์', unit: 'ชิ้น', mission: 'm1', group: 'g1' },
  { id: 'i15', code: '8858318049882', name: 'สาย CV065 Cable VGA(3+6) 1.5 m', category: 'สายไฟฟ้า', unit: 'ม้วน', mission: 'm4', group: 'g12' },
  { id: 'i16', code: '884116194743', name: 'เมาส์ Dell Wired Mouse MS116', category: 'อุปกรณ์ต่อพ่วง', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i17', code: '4977766837088', name: 'หมึกน้ำแบบขวด BT D100bk (สีดำ)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i18', code: '884116180852', name: 'แป้นพิมพ์ Dell', category: 'อุปกรณ์ต่อพ่วง', unit: 'อัน', mission: 'm4', group: 'g12' },
  { id: 'i19', code: '4549292183009', name: 'หัวพิมพ์ canon CH-7 Color', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i20', code: '4549292182996', name: 'หัวพิมพ์ canon BH-7 Black', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i21', code: '8809452308106', name: 'Card Reader', category: 'อุปกรณ์ต่อพ่วง', unit: 'กล่อง', mission: 'm4', group: 'g12' },
  { id: 'i22', code: '121068112471', name: 'PC TO TV VGA to HDMI Converter รุ่น VH-022', category: 'อุปกรณ์ต่อพ่วง', unit: 'อัน', mission: 'm4', group: 'g12' },
  { id: 'i23', code: '4977766837095', name: 'หมึกน้ำแบบขวด BT100c (สีน้ำเงิน)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i24', code: '4977766837101', name: 'หมึกน้ำแบบขวด BT100m (สีแดง)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i25', code: '4977766837118', name: 'หมึกน้ำแบบขวด BT100y (สีเหลือง)', category: 'หมึกพิมพ์', unit: 'ขวด', mission: 'm1', group: 'g1' },
  { id: 'i26', code: '718037894850', name: 'อุปกรณ์สำรองข้อมูล WD Blue 500GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i27', code: '843367123148', name: 'อุปกรณ์เก็บข้อมูล SSD 256 GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i28', code: '6941788898691', name: 'อุปกรณ์ต่อพ่วง 4-IN-1 USB 3.0 HUB', category: 'อุปกรณ์ต่อพ่วง', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i29', code: '24322555', name: 'ปลั๊กไฟ Panasonic ยาว 5m WCHG 28572', category: 'อุปกรณ์ไฟฟ้า', unit: 'ชิ้น', mission: 'm1', group: 'g1' },
  { id: 'i30', code: '6957303858194', name: 'สาย HDMI CABLE ความยาว 1.5M', category: 'สายไฟฟ้า', unit: 'กล่อง', mission: 'm4', group: 'g12' },
  { id: 'i31', code: '6974202721626', name: 'อุปกรณ์สำรองข้อมูล HIKSEMI E100 SSD SATA', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i32', code: '619659182274', name: 'อุปกรณ์เก็บข้อมูล SanDisk UltraShift 32GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i33', code: '740617309829', name: 'อุปกรณ์เก็บข้อมูล Kingston DataTraveler Exodia 64 GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i34', code: '4977766791182', name: 'หมึก Toner Brother TN-263C', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i35', code: '4977766791229', name: 'หมึก Toner Brother TN-263Y', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i36', code: '4977766791205', name: 'หมึก Toner Brother TN-263M', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i37', code: '6942937501819', name: 'บล๊อกยาง+รางปลั๊กไฟ ยาว 10m', category: 'อุปกรณ์ไฟฟ้า', unit: 'ม้วน', mission: 'm1', group: 'g1' },
  { id: 'i38', code: '6941264087434', name: 'Ethernet Switch', category: 'เครือข่าย', unit: 'เครื่อง', mission: 'm4', group: 'g12' },
  { id: 'i39', code: '8850117132314', name: 'สายไมค์ชุดประชุม', category: 'สายไฟฟ้า', unit: 'ม้วน', mission: 'm1', group: 'g1' },
  { id: 'i40', code: '6985071220110', name: 'สาย HDMI 2.0 GLINK ยาว 10M', category: 'สายไฟฟ้า', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i41', code: '790712100708', name: 'Type-C Converter Adapter', category: 'อุปกรณ์ต่อพ่วง', unit: 'อัน', mission: 'm4', group: 'g12' },
  { id: 'i42', code: '6957303858217', name: 'สาย HDMI CABLE ความยาว 5M', category: 'สายไฟฟ้า', unit: 'กล่อง', mission: 'm4', group: 'g12' },
  { id: 'i43', code: '6941264087427', name: 'Smart Managed Switch DS-3E1510P-SI', category: 'เครือข่าย', unit: 'เครื่อง', mission: 'm4', group: 'g12' },
  { id: 'i44', code: '6974202728229', name: 'อุปกรณ์สำรองข้อมูล HS-SSD-FUTURE Lite 1024GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i45', code: '4977766791168', name: 'หมึก Toner Brother TN-263BK', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
  { id: 'i46', code: '791303120020', name: 'น้ำยาทำความสะอาดอุปกรณ์คอมพิวเตอร์', category: 'ทำความสะอาด', unit: 'ชิ้น', mission: 'm4', group: 'g12' },
  { id: 'i47', code: 'A0076034', name: 'Converter Adapter micro HDMI to VGA', category: 'อุปกรณ์ต่อพ่วง', unit: 'อัน', mission: 'm4', group: 'g12' },
  { id: 'i48', code: '240033407739', name: 'ซีลิโคน CPU', category: 'ทำความสะอาด', unit: 'หลอด', mission: 'm4', group: 'g12' },
  { id: 'i49', code: '6942937501810', name: 'Print HEAD Brother', category: 'หมึกพิมพ์', unit: 'กล่อง', mission: 'm1', group: 'g1' },
];

const codeToSeed = {};
seedItems.forEach(s => { codeToSeed[s.code] = s; });

const transactions = [];
let rcvNo = 1;
const Y = new Date().getFullYear();
let matched = 0;

excelData.forEach(row => {
  const code = String(row['รหัสวัสดุ'] || '').trim();
  const qty = parseInt(row['คงเหลือ']) || 0;
  const seed = codeToSeed[code];
  if (seed && qty > 0) {
    matched++;
    transactions.push({
      id: 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      type: 'receive',
      no: 'RCV-' + Y + '-' + String(rcvNo++).padStart(4, '0'),
      date: '2026-08-20',
      party: 'นำเข้าจาก Excel',
      receiver: '', partyRx: '',
      by: 'admin', byName: 'Admin001',
      note: 'ข้อมูลจากรายงานคงเหลือ 20/08/2569',
      mission: seed.mission, group: seed.group,
      items: [{ itemId: seed.id, name: seed.name, qty, serials: [] }],
    });
  }
});

const fullItems = seedItems.map(s => ({
  id: s.id, code: s.code, name: s.name, category: s.category, unit: s.unit,
  minStock: 1, location: '', note: '', mission: s.mission, group: s.group,
  image: '', trackSerial: false,
}));

const users = [
  { id: 'u1', username: 'Admin001', password: 'h1698d', name: 'ผู้ดูแลระบบ', role: 'admin' },
];

const backup = {
  items: fullItems,
  transactions,
  users,
  reorderItems: [],
  seq: { item: 49, receive: rcvNo - 1, issue: 0 },
};

fs.writeFileSync('IT-Stock-Backup-CORRECT.json', JSON.stringify(backup, null, 2));

// Verify
const stockMap = {};
fullItems.forEach(i => stockMap[i.id] = { name: i.name, qty: 0 });
transactions.forEach(tx => {
  tx.items.forEach(l => {
    if (stockMap[l.itemId]) stockMap[l.itemId].qty += l.qty;
  });
});

console.log('Matched:', matched, '/ 49 items');
console.log('Transactions:', transactions.length);
console.log('\nStock verification:');
Object.entries(stockMap).forEach(([id, s]) => {
  console.log('  ' + id + ' ' + s.name + ' -> ' + s.qty);
});
