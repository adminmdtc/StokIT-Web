'use strict';

/* ============================================================
   Data layer — เก็บข้อมูลใน localStorage + ข้อมูลตัวอย่างเริ่มต้น
   ============================================================ */

const DB_KEY = 'it_stock_db_v5';
const SESSION_KEY = 'it_stock_session_v1';

/* ---------- ตัวช่วย ---------- */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < String(s || '').length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(16);
}
function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function daysAgo(n) { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

/* ---------- ข้อมูลตัวอย่าง (นำเข้าจาก Excel รายงานคงเหลือ) ---------- */
function buildSeed() {
  const Y = new Date().getFullYear();

  /* ข้อมูลอุปกรณ์จาก Excel รายงานคงเหลือ (พร้อมหมวดหมู่และสถานที่จัดเก็บ) */
  const items = [
    { id: 'i1',  code: '8850816112044', name: 'แผ่นรองเมาส์ Oker',                          category: 'อุปกรณ์ต่อพ่วง',   unit: 'แผ่น', minStock: 1,  location: 'ตู้ B เลขที่ 12', mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i2',  code: '4977766786324', name: 'น้ำหมึกแบบขวด BT D60bk(สีดำ)',               category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i3',  code: '4977766748148', name: 'หมึกน้ำแบบขวด BT500m(สีแดง)',                category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i4',  code: '6942937504869', name: 'ตลับหมึกผง เทียบ35A',                        category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 5',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i5',  code: '8858835272046', name: 'แบบตรี่ เครื่องสำรองไฟ',                    category: 'อุปกรณ์ไฟฟ้า',     unit: 'ก้อน', minStock: 1,  location: 'ตู้ C เลขที่ 1',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i6',  code: '6936358007061', name: 'ตลับหมึก pantum TL-410x',                    category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 5',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i7',  code: '4977766748155', name: 'น้ำหมึกแบบขวด BT5000y (สีเหลือง)',           category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i8',  code: '4549292041880', name: 'หมึกน้ำแบบขวด canon BK GI-790<BK>',         category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 4',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i9',  code: '4977766748131', name: 'หมึกน้ำแบบขวด BT5000c(สีน้ำเงิน)',          category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i10', code: '6936358057479', name: 'ดรั้ม pantum DL410',                          category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 5',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i11', code: '4549292041927', name: 'หมึกน้ำแบบขวด canon M GI-790<M>',           category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 4',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i12', code: '4549292041941', name: 'หมึกน้ำแบบขวด canon Y GI-790<Y>',           category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 4',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i13', code: '4549292041903', name: 'หมึกน้ำแบบขวด canon C GI-790<C>',           category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 4',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i14', code: '4961311926631', name: 'ตลับหมึก RICOH SP230H',                      category: 'หมึกพิมพ์',        unit: 'ชิ้น', minStock: 1,  location: 'ตู้ A เลขที่ 5',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i15', code: '8858318049882', name: 'สาย CV065 Cable VGA(3+6) 1.5 m',             category: 'สายไฟฟ้า',        unit: 'ม้วน', minStock: 1,  location: 'ตู้ B เลขที่ 8',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i16', code: '884116194743',  name: 'เมาส์ Dell Wired Mouse MS116',                category: 'อุปกรณ์ต่อพ่วง',   unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 11', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i17', code: '4977766837088', name: 'หมึกน้ำแบบขวด BT D100bk (สีดำ)',             category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i18', code: '884116180852',  name: 'แป้นพิมพ์ Dell',                              category: 'อุปกรณ์ต่อพ่วง',   unit: 'อัน', minStock: 1,  location: 'ตู้ B เลขที่ 11', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i19', code: '4549292183009', name: 'หัวพิมพ์ canon CH-7 Color',                   category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 6',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i20', code: '4549292182996', name: 'หัวพิมพ์ canon BH-7 Black',                   category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 6',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i21', code: '8809452308106', name: 'Card Reader',                                 category: 'อุปกรณ์ต่อพ่วง',   unit: 'กล่อง', minStock: 1,  location: 'ตู้ B เลขที่ 12', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i22', code: '121068112471',  name: 'PC TO TV VGA to HDMI Converter รุ่น VH-022',  category: 'อุปกรณ์ต่อพ่วง',   unit: 'อัน', minStock: 1,  location: 'ตู้ B เลขที่ 10', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i23', code: '4977766837095', name: 'หมึกน้ำแบบขวด BT100c (สีน้ำเงิน)',           category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i24', code: '4977766837101', name: 'หมึกน้ำแบบขวด BT100m (สีแดง)',               category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i25', code: '4977766837118', name: 'หมึกน้ำแบบขวด BT100y (สีเหลือง)',            category: 'หมึกพิมพ์',        unit: 'ขวด', minStock: 1,  location: 'ตู้ A เลขที่ 3',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i26', code: '718037894850',  name: 'อุปกรณ์สำรองข้อมูล WD Blue 500GB',           category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 7',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i27', code: '843367123148',  name: 'อุปกรณ์เก็บข้อมูล SSD 256 GB',               category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 7',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i28', code: '6941788898691', name: 'อุปกรณ์ต่อพ่วง 4-IN-1 USB 3.0 HUB',          category: 'อุปกรณ์ต่อพ่วง',   unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 12', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i29', code: '24322555',      name: 'ปลั๊กไฟ Panasonic ยาว 5m WCHG 28572',        category: 'อุปกรณ์ไฟฟ้า',     unit: 'ชิ้น', minStock: 1,  location: 'ตู้ C เลขที่ 2',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i30', code: '6957303858194', name: 'สาย HDMI CABLE ความยาว 1.5M',                category: 'สายไฟฟ้า',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ B เลขที่ 8',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i31', code: '6974202721626', name: 'อุปกรณ์สำรองข้อมูล HIKSEMI E100 SSD SATA',   category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 7',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i32', code: '619659182274',  name: 'อุปกรณ์เก็บข้อมูล SanDisk UltraShift 32GB',  category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 7',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i33', code: '740617309829',  name: 'อุปกรณ์เก็บข้อมูล Kingston DataTraveler Exodia 64 GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', minStock: 1, location: 'ตู้ B เลขที่ 7', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i34', code: '4977766791182', name: 'หมึก Toner Brother TN-263C',                 category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 7',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i35', code: '4977766791229', name: 'หมึก Toner Brother TN-263Y',                 category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 7',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i36', code: '4977766791205', name: 'หมึก Toner Brother TN-263M',                 category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 7',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i37', code: '6942937501819', name: 'บล๊อกยาง+รางปลั๊กไฟ ยาว 10m',               category: 'อุปกรณ์ไฟฟ้า',     unit: 'ม้วน', minStock: 0,  location: 'ตู้ C เลขที่ 2',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i38', code: '6941264087434', name: 'Ethernet Switch',                              category: 'เครือข่าย',        unit: 'เครื่อง', minStock: 0,  location: 'ห้องเซิร์ฟเวอร์', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i39', code: '8850117132314', name: 'สายไมค์ชุดประชุม',                           category: 'สายไฟฟ้า',        unit: 'ม้วน', minStock: 0,  location: 'ตู้ B เลขที่ 9',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i40', code: '6985071220110', name: 'สาย HDMI 2.0 GLINK ยาว 10M',                 category: 'สายไฟฟ้า',        unit: 'ชิ้น', minStock: 1,  location: 'ตู้ B เลขที่ 8',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i41', code: '790712100708',  name: 'Type-C Converter Adapter',                     category: 'อุปกรณ์ต่อพ่วง',   unit: 'อัน', minStock: 1,  location: 'ตู้ B เลขที่ 10', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i42', code: '6957303858217', name: 'สาย HDMI CABLE ความยาว 5M',                  category: 'สายไฟฟ้า',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ B เลขที่ 8',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i43', code: '6941264087427', name: 'Smart Managed Switch DS-3E1510P-SI',          category: 'เครือข่าย',        unit: 'เครื่อง', minStock: 1,  location: 'ห้องเซิร์ฟเวอร์', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i44', code: '6974202728229', name: 'อุปกรณ์สำรองข้อมูล HS-SSD-FUTURE Lite 1024GB', category: 'อุปกรณ์เก็บข้อมูล', unit: 'ชิ้น', minStock: 0, location: 'ตู้ B เลขที่ 7', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i45', code: '4977766791168', name: 'หมึก Toner Brother TN-263BK',                category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 7',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i46', code: '791303120020',  name: 'น้ำยาทำความสะอาดอุปกรณ์คอมพิวเตอร์',          category: 'ทำความสะอาด',      unit: 'ชิ้น', minStock: 1,  location: 'ตู้ C เลขที่ 3',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i47', code: 'A0076034',      name: 'Converter Adapter micro HDMI to VGA',          category: 'อุปกรณ์ต่อพ่วง',   unit: 'อัน', minStock: 1,  location: 'ตู้ B เลขที่ 10', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i48', code: '240033407739',  name: 'ซีลิโคน CPU',                                 category: 'ทำความสะอาด',      unit: 'หลอด', minStock: 0,  location: 'ตู้ C เลขที่ 3',  mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i49', code: '6942937501810', name: 'Print HEAD Brother',                           category: 'หมึกพิมพ์',        unit: 'กล่อง', minStock: 1,  location: 'ตู้ A เลขที่ 6',  mission: 'm1', group: 'g1', note: '', trackSerial: false },
  ];

  /* สร้างรายการรับเข้าเพื่อตั้งค่าคงเหลือเริ่มต้นตาม Excel */
  const stockData = {
    'i1': 29, 'i2': 24, 'i3': 23, 'i4': 22, 'i5': 22, 'i6': 21, 'i7': 19, 'i8': 18,
    'i9': 17, 'i10': 15, 'i11': 14, 'i12': 13, 'i13': 13, 'i14': 12, 'i15': 11, 'i16': 9,
    'i17': 8, 'i18': 7, 'i19': 7, 'i20': 6, 'i21': 5, 'i22': 4, 'i23': 4, 'i24': 4,
    'i25': 4, 'i26': 4, 'i27': 4, 'i28': 3, 'i29': 2, 'i30': 2, 'i31': 2, 'i32': 2,
    'i33': 2, 'i34': 1, 'i35': 1, 'i36': 1, 'i37': 1, 'i38': 1, 'i39': 1, 'i40': 1,
    'i41': 1, 'i42': 1, 'i43': 1, 'i44': 1, 'i45': 0, 'i46': 0, 'i47': 0, 'i48': 0, 'i49': 0,
  };

  const transactions = [];
  let rcvNo = 1;
  Object.entries(stockData).forEach(([itemId, qty]) => {
    if (qty <= 0) return;
    const it = items.find(i => i.id === itemId);
    transactions.push({
      id: uid('tx'), type: 'receive',
      no: `RCV-${Y}-${String(rcvNo++).padStart(4, '0')}`,
      date: daysAgo(180),
      party: 'นำเข้าจาก Excel',
      note: 'ข้อมูลเริ่มต้นจากรายงานคงเหลือ',
      by: 'admin', byName: 'ผู้ดูแลระบบ',
      items: [{ itemId, name: it.name, qty, serials: [] }],
    });
  });

  const users = [
    { id: 'u1', username: 'Admin001', password: hashStr('14197'), name: 'ผู้ดูแลระบบ',     role: 'admin' },
    { id: 'u2', username: 'user',  password: hashStr('14197'),  name: 'เจ้าหน้าที่พัสดุ', role: 'user' },
  ];

  return { items, transactions, users, seq: { item: 49, receive: rcvNo - 1, issue: 0 } };
}

/* ---------- Store API ---------- */
const Store = {
  db: null,

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.items)) { this.db = d; return this.db; }
      }
    } catch (e) { /* ignore */ }
    this.db = buildSeed();
    this.save();
    return this.db;
  },

  /* โหลดข้อมูลจาก Firebase (ถ้ามี) */
  async loadFromFirebase() {
    if (typeof FirebaseDB !== 'undefined' && FirebaseDB.connected) {
      try {
        const success = await FirebaseDB.syncFromFirebase();
        if (success) {
          console.log('Loaded data from Firebase');
          return true;
        }
      } catch (e) {
        console.error('Load from Firebase error:', e);
      }
    }
    return false;
  },
  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    // Auto sync to Firebase
    if (typeof autoSyncToFirebase === 'function') {
      autoSyncToFirebase();
    }
  },
  reset() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    this.db = buildSeed();
    this.save();
  },

  items() { return this.db.items; },
  transactions() { return this.db.transactions; },
  users() { return this.db.users; },
  getItem(id) { return this.db.items.find(i => i.id === id); },

  nextItemCode() { const n = ++this.db.seq.item; return 'IT-' + String(n).padStart(4, '0'); },
  nextTxNo(type) {
    const key = type === 'receive' ? 'receive' : 'issue';
    const n = ++this.db.seq[key];
    const pre = type === 'receive' ? 'RCV' : 'ISS';
    return `${pre}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
  },

  addItem(data) {
    const it = Object.assign({ id: uid('it'), code: this.nextItemCode(), category: '', unit: '', minStock: 0, location: '', note: '', mission: '', group: '', workUnit: '' }, data);
    this.db.items.push(it);
    this.save();
    return it;
  },
  updateItem(id, data) {
    const it = this.getItem(id);
    if (!it) return null;
    Object.assign(it, data);
    this.save();
    return it;
  },
  deleteItem(id) { this.db.items = this.db.items.filter(i => i.id !== id); this.save(); },

  addTransaction(tx) { this.db.transactions.unshift(tx); this.save(); return tx; },
  deleteTransaction(id) { this.db.transactions = this.db.transactions.filter(t => t.id !== id); this.save(); },

  addUser(data) {
    const u = Object.assign({ id: uid('u'), role: 'user' }, data);
    u.password = hashStr(u.password);
    this.db.users.push(u);
    this.save();
    return u;
  },
  updateUser(id, data) {
    const u = this.db.users.find(x => x.id === id);
    if (!u) return null;
    if (data.password) data.password = hashStr(data.password);
    Object.assign(u, data);
    this.save();
    return u;
  },
  deleteUser(id) { this.db.users = this.db.users.filter(x => x.id !== id); this.save(); },
  findUser(username) { return this.db.users.find(u => u.username.toLowerCase() === String(username).toLowerCase()); },

  /* แผนที่ Serial: itemId -> { serial: { receive?, issue? } }
     หมายเหตุ: เอกสารใหม่ถูกแทรกไว้ตำแหน่งแรกของอาร์เรย์ (เรียงย้อนเวลา)
     จึงต้องประมวลผลรับเข้าก่อน แล้วค่อยประมวลผลเบิกจ่าย */
  serialMap() {
    const map = {};
    const apply = tx => {
      tx.items.forEach(l => {
        if (!l.serials || !l.serials.length) return;
        const m = (map[l.itemId] = map[l.itemId] || {});
        l.serials.forEach(s => {
          if (tx.type === 'receive') {
            m[s] = { serial: s, receive: { no: tx.no, date: tx.date, party: tx.party }, issue: null };
          } else if (m[s]) {
            m[s].issue = { no: tx.no, date: tx.date, party: tx.party };
          }
        });
      });
    };
    this.db.transactions.forEach(tx => { if (tx.type === 'receive') apply(tx); });
    this.db.transactions.forEach(tx => { if (tx.type === 'issue') apply(tx); });
    return map;
  },
  serialsInStock(itemId) {
    const m = this.serialMap()[itemId] || {};
    return Object.values(m).filter(x => x.receive && !x.issue);
  },
  serialsInStockList() {
    const smap = this.serialMap();
    const out = [];
    Object.keys(smap).forEach(id => {
      Object.values(smap[id]).forEach(x => {
        if (x.receive && !x.issue) out.push({ itemId: id, serial: x.serial });
      });
    });
    return out;
  },

  /* คำนวณคงเหลือจากรายการรับเข้า/จำหน่าย */
  getStock() {
    const map = {};
    const smap = this.serialMap();
    this.db.items.forEach(i => { map[i.id] = Object.assign({}, i, { qty: 0, value: 0 }); });
    this.db.transactions.forEach(tx => {
      tx.items.forEach(l => {
        const m = map[l.itemId];
        if (!m || m.trackSerial) return; /* วัสดุแบบติดตามรายชิ้น คำนวณจาก Serial */
        m.qty += (tx.type === 'receive' ? l.qty : -l.qty);
      });
    });
    Object.keys(smap).forEach(id => {
      if (!map[id]) return;
      map[id].qty = Object.values(smap[id]).filter(x => x.receive && !x.issue).length;
    });
    return Object.values(map)
      .map(s => {
        s.value = 0;
        s.status = s.qty <= 0 ? 'out' : (s.qty < (Number(s.minStock) || 0) ? 'low' : 'ok');
        return s;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  },

  categories() {
    const set = new Set();
    this.db.items.forEach(i => { if (i.category) set.add(i.category); });
    return [...set].sort((a, b) => a.localeCompare(b, 'th-TH', { sensitivity: 'base' }));
  },
  departments() {
    const set = new Set();
    this.db.items.forEach(i => { if (i.group) set.add(i.group); });
    return [...set];
  },
};

/* ---------- ระบบล็อกอิน / เซสชัน ---------- */
const Auth = {
  current() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!s) return null;
      const u = Store.users().find(x => x.id === s.userId);
      return u || null;
    } catch (e) { return null; }
  },
  login(username, password) {
    const u = Store.findUser(username);
    if (!u || u.password !== hashStr(password)) return null;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id, at: Date.now() }));
    return u;
  },
  logout() { localStorage.removeItem(SESSION_KEY); },
  changePassword(userId, cur, np) {
    const u = Store.users().find(x => x.id === userId);
    if (!u || u.password !== hashStr(cur)) return false;
    u.password = hashStr(np);
    Store.save();
    return true;
  },
};
