'use strict';

/* ============================================================
   Data layer — เก็บข้อมูลใน localStorage + ข้อมูลตัวอย่างเริ่มต้น
   ============================================================ */

const DB_KEY = 'it_stock_db_v5';
const SYNC_BASE_KEY = 'it_stock_sync_base_v1';
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
    /* อะไหล่วัสดุคอมพิวเตอร์ */
    { id: 'i50', code: 'RAM-DDR4-8G',    name: 'แรม DDR4 8GB 2666MHz',                        category: 'อะไหล่วัสดุคอมพิวเตอร์', unit: 'ชิ้น', minStock: 2, location: 'ตู้ B เลขที่ 1', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i51', code: 'HDD-1TB',        name: 'ฮาร์ดดิส Western Digital 1TB',                 category: 'อะไหล่วัสดุคอมพิวเตอร์', unit: 'ชิ้น', minStock: 1, location: 'ตู้ B เลขที่ 2', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i52', code: 'SSD-256G',       name: 'SSD 256GB SATA 2.5"',                         category: 'อะไหล่วัสดุคอมพิวเตอร์', unit: 'ชิ้น', minStock: 2, location: 'ตู้ B เลขที่ 2', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i53', code: 'PSU-500W',       name: 'พาวเวอร์ซัพพลาย 500W',                       category: 'อะไหล่วัสดุคอมพิวเตอร์', unit: 'ชิ้น', minStock: 1, location: 'ตู้ B เลขที่ 3', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    /* เครื่องมือช่าง */
    { id: 'i54', code: 'SCREW-KIT',      name: 'ชุดไขควง 6 แกน',                              category: 'เครื่องมือช่าง',       unit: 'ชุด', minStock: 1, location: 'ตู้ D เลขที่ 1', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i55', code: 'PLIER-SET',      name: 'ชุดคีม 3 ขนาด',                               category: 'เครื่องมือช่าง',       unit: 'ชุด', minStock: 1, location: 'ตู้ D เลขที่ 2', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i56', code: 'TAPE-INSUL',     name: 'เทปพันสายไฟ 19mm',                            category: 'เครื่องมือช่าง',       unit: 'ม้วน', minStock: 5, location: 'ตู้ D เลขที่ 3', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    /* อะไหล่วัสดุปริ้นเตอร์ */
    { id: 'i57', code: 'DRUM-PANTUM',    name: 'ดรั้ม Panther DR-2200',                       category: 'อะไหล่วัสดุปริ้นเตอร์', unit: 'ชิ้น', minStock: 1, location: 'ตู้ A เลขที่ 7', mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i58', code: 'FUSER-HP',       name: 'ชุดความร้อน Fuser Unit HP M402',              category: 'อะไหล่วัสดุปริ้นเตอร์', unit: 'ชิ้น', minStock: 1, location: 'ตู้ A เลขที่ 8', mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i59', code: 'ROLLER-EPSON',   name: 'ยางม้วนกระดาษ Epson L3110',                  category: 'อะไหล่วัสดุปริ้นเตอร์', unit: 'ชิ้น', minStock: 2, location: 'ตู้ A เลขที่ 9', mission: 'm1', group: 'g1', note: '', trackSerial: false },
    /* วัสดุอุปกรณ์บำรุงต่างๆ */
    { id: 'i60', code: 'CLEAN-CART',     name: 'ชุดทำความสะอาดหัวพิมพ์',                     category: 'วัสดุอุปกรณ์บำรุงต่างๆ', unit: 'ชุด', minStock: 2, location: 'ตู้ A เลขที่ 10', mission: 'm1', group: 'g1', note: '', trackSerial: false },
    { id: 'i61', code: 'SPRAY-AIR',     name: 'สเปรย์เป่าฝุ่น 400ml',                         category: 'วัสดุอุปกรณ์บำรุงต่างๆ', unit: 'กระป๋อง', minStock: 3, location: 'ตู้ C เลขที่ 4', mission: 'm4', group: 'g12', note: '', trackSerial: false },
    { id: 'i62', code: 'THERMAL-PASTE', name: 'ซีลิโคนระบายความร้อน Arctic MX-4',             category: 'วัสดุอุปกรณ์บำรุงต่างๆ', unit: 'หลอด', minStock: 2, location: 'ตู้ C เลขที่ 5', mission: 'm4', group: 'g12', note: '', trackSerial: false },
  ];

  /* สร้างรายการรับเข้าเพื่อตั้งค่าคงเหลือเริ่มต้นตาม Excel */
  const stockData = {
    'i1': 29, 'i2': 24, 'i3': 23, 'i4': 22, 'i5': 22, 'i6': 21, 'i7': 19, 'i8': 18,
    'i9': 17, 'i10': 15, 'i11': 14, 'i12': 13, 'i13': 13, 'i14': 12, 'i15': 11, 'i16': 9,
    'i17': 8, 'i18': 7, 'i19': 7, 'i20': 6, 'i21': 5, 'i22': 4, 'i23': 4, 'i24': 4,
    'i25': 4, 'i26': 4, 'i27': 4, 'i28': 3, 'i29': 2, 'i30': 2, 'i31': 2, 'i32': 2,
    'i33': 2, 'i34': 1, 'i35': 1, 'i36': 1, 'i37': 1, 'i38': 1, 'i39': 1, 'i40': 1,
    'i41': 1, 'i42': 1, 'i43': 1, 'i44': 1, 'i45': 0, 'i46': 0, 'i47': 0, 'i48': 0, 'i49': 0,
    'i50': 5, 'i51': 3, 'i52': 4, 'i53': 2, 'i54': 3, 'i55': 2, 'i56': 10, 'i57': 3,
    'i58': 1, 'i59': 4, 'i60': 5, 'i61': 8, 'i62': 4,
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

  return { items, transactions, users, reorderItems: [], seq: { item: 49, receive: rcvNo - 1, issue: 0 } };
}

/* ---------- Store API ---------- */
const Store = {
  db: null,
  _lastSyncedDb: null, // base snapshot สำหรับเปรียบเทียบ conflict
  _currentUserId: null, // ผู้ใช้ปัจจุบันสำหรับ stamped updatedBy

  /* stamp เวลาแก้ไขทุก record */
  _stamp(obj) {
    obj.updatedAt = Date.now();
    if (this._currentUserId) obj.updatedBy = this._currentUserId;
    return obj;
  },

  _isSQLite() { return typeof window !== 'undefined' && window.electronDB && window.electronDB.isElectron; },

  async load() {
    /* ---- Electron SQLite ---- */
    if (this._isSQLite()) {
      try {
        const data = await window.electronDB.loadAll();
        if (data && data.items && data.items.length) {
          this.db = {
            items: data.items,
            transactions: (data.transactions || []).map(t => ({ ...t, items: typeof t.items === 'string' ? JSON.parse(t.items) : t.items })),
            users: data.users || [],
            reorderItems: data.reorderItems || [],
            seq: { item: data.items.length, tx: (data.transactions || []).length, user: (data.users || []).length },
          };
          console.log('SQLite: loaded', data.items.length, 'items');
          return this.db;
        }
      } catch (e) { console.error('SQLite load error:', e); }
    }
    /* ---- localStorage fallback ---- */
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.items)) { this.db = d; /* sync to SQLite */ if (this._isSQLite()) this.save(); return this.db; }
      }
    } catch (e) { /* ignore */ }
    this.db = buildSeed();
    this.save();
    return this.db;
  },

  /* บันทึก snapshot base หลัง sync จาก Firebase */
  _saveSyncBase() {
    try { localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(this.db)); } catch (e) { /* ignore */ }
  },

  /* โหลด snapshot base ที่บันทึกไว้ */
  _loadSyncBase() {
    try {
      const raw = localStorage.getItem(SYNC_BASE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  /* คืน local changes ตั้งแต่ sync ล่าสุด */
  _getLocalChangesSinceSync() {
    const base = this._lastSyncedDb || this._loadSyncBase();
    if (!base) return null; // ไม่มี base = first sync
    const changes = { items: {}, transactions: {}, users: {}, seq: null };
    const bMap = {};
    (base.items || []).forEach(i => bMap[i.id] = i);
    (this.db.items || []).forEach(i => {
      const b = bMap[i.id];
      if (!b) changes.items[i.id] = { type: 'add', local: i };
      else {
        const diffs = this._fieldDiffs(b, i, ['id']);
        if (diffs.length) changes.items[i.id] = { type: 'update', local: i, base: b, diffs };
      }
    });
    (base.items || []).forEach(i => {
      if (!this.db.items.find(x => x.id === i.id))
        changes.items[i.id] = { type: 'delete', base: i };
    });
    /* transactions & users — เปรียบเทียบ id set */
    const bTxIds = new Set((base.transactions || []).map(t => t.id));
    const lTxIds = new Set((this.db.transactions || []).map(t => t.id));
    (this.db.transactions || []).forEach(t => {
      if (!bTxIds.has(t.id)) changes.transactions[t.id] = { type: 'add', local: t };
    });
    const bUsrIds = new Set((base.users || []).map(u => u.id));
    (this.db.users || []).forEach(u => {
      if (!bUsrIds.has(u.id)) changes.users[u.id] = { type: 'add', local: u };
    });
    return changes;
  },

  /* เปรียบเทียบ field 2 วัตถุ คืน field ที่ต่างกัน */
  _fieldDiffs(a, b, exclude = []) {
    const diffs = [];
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    allKeys.forEach(k => {
      if (exclude.includes(k)) return;
      const va = JSON.stringify(a[k]);
      const vb = JSON.stringify(b[k]);
      if (va !== vb) diffs.push({ field: k, localVal: b[k], baseVal: a[k] });
    });
    return diffs;
  },


  async save() {
    // อัพเดท timestamp สำหรับ sync
    this.db._lastSync = Date.now();
    this.db._lastUpdate = new Date().toISOString();
    
    /* ---- Electron SQLite ---- */
    if (this._isSQLite()) {
      try {
        await window.electronDB.saveAll({
          items: this.db.items || [],
          transactions: (this.db.transactions || []).map(t => ({ ...t, items: JSON.stringify(t.items || []) })),
          users: this.db.users || [],
          reorderItems: this.db.reorderItems || [],
        });
      } catch (e) { console.error('SQLite save error:', e); }
    }
    
    /* ---- localStorage fallback ---- */
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    

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

  /* ตั้ง qty โดยตรง — ลบ receive เดิมของ item แล้วสร้างใหม่ (สำหรับ Admin แก้ไขจำนวน) */
  setQtyDirect(itemId, newQty) {
    const item = this.getItem(itemId);
    if (!item) return;
    /* ลบ transaction ที่เกี่ยวข้องกับ item นี้ทั้งหมด */
    this.db.transactions = this.db.transactions.filter(tx => {
      const hasItem = tx.items.some(l => l.itemId === itemId);
      if (hasItem) return false;
      return true;
    });
    /* สร้าง receive transaction ใหม่ด้วยจำนวนที่ถูกต้อง */
    if (newQty > 0) {
      this.db.transactions.unshift({
        id: uid('tx'), type: 'receive',
        no: this.nextTxNo('receive'),
        date: todayStr(),
        party: 'แก้ไขจำนวนตรง',
        receiver: '', partyRx: '',
        by: 'admin', byName: 'Admin001',
        note: `แก้ไขจำนวนตรงเป็น ${newQty}`,
        mission: item.mission || '', group: item.group || '', workUnit: item.workUnit || '',
        items: [{ itemId, name: item.name, qty: newQty, serials: [] }],
      });
    }
    this.save();
    this._cloudAdd('tx', this.db.transactions[0]);
  },

  addItem(data) {
    const defaults = { id: uid('it'), code: this.nextItemCode(), category: '', unit: '', minStock: 0, location: '', note: '', mission: '', group: '', workUnit: '', image: '' };
    const it = Object.assign(defaults, data);
    if (!it.code || it.code === '') it.code = this.nextItemCode();
    this._stamp(it);
    this.db.items.push(it);
    this.save();
    this._cloudAdd('item', it);
    return it;
  },
  updateItem(id, data) {
    const it = this.getItem(id);
    if (!it) return null;
    Object.assign(it, data);
    this._stamp(it);
    this.save();
    this._mysqlUpdate('item', id, data);
    return it;
  },
  deleteItem(id) { this.db.items = this.db.items.filter(i => i.id !== id); this.save(); this._mysqlDelete('item', id); },

  addTransaction(tx) { this._stamp(tx); this.db.transactions.unshift(tx); this.save();    this._cloudAdd('tx', tx); return tx; },
  deleteTransaction(id) { this.db.transactions = this.db.transactions.filter(t => t.id !== id); this.save(); this._mysqlDelete('tx', id); },

  /* ลบเฉพาะรายการแก้ไขสต็อก (party = 'แก้ไขสต็อก' หรือ 'แก้ไขจำนวนตรง') */
  deleteStockEditTransactions() {
    const count = this.db.transactions.filter(t => t.party === 'แก้ไขสต็อก' || t.party === 'แก้ไขจำนวนตรง').length;
    this.db.transactions = this.db.transactions.filter(t => t.party !== 'แก้ไขสต็อก' && t.party !== 'แก้ไขจำนวนตรง');
    this.save();
    return count;
  },

  addUser(data) {
    const u = Object.assign({ id: uid('u'), role: 'user' }, data);
    u.password = hashStr(u.password);
    this._stamp(u);
    this.db.users.push(u);
    this.save();
    this._cloudAdd('user', u);
    return u;
  },
  updateUser(id, data) {
    const u = this.db.users.find(x => x.id === id);
    if (!u) return null;
    if (data.password) data.password = hashStr(data.password);
    Object.assign(u, data);
    this._stamp(u);
    this.save();
    this._mysqlUpdate('user', id, data);
    return u;
  },
  deleteUser(id) { this.db.users = this.db.users.filter(x => x.id !== id); this.save(); this._mysqlDelete('user', id); },
  findUser(username) { return this.db.users.find(u => u.username.toLowerCase() === String(username).toLowerCase()); },

  /* Cloud backend — เลือกได้ระหว่าง MySQL (ผ่าน server) หรือ Supabase (คลาวด์โดยตรง) */
  _cloudBackend() {
    if (typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled) return SupabaseBackend;
    return null; /* MySQL ตรวจที่ _isMySQL() แยกอยู่แล้ว */
  },
  _isMySQL() { return typeof MySQLBackend !== 'undefined' && MySQLBackend.enabled && this._cloudBackend() === null; },
  _isCloud() { return !!(typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled) || this._isMySQL(); },

  /* MySQL Mode — force=true จะดึงข้อมูลแม้ยังไม่เปิดใช้งาน (ใช้หลังบันทึก config) */
  async syncFromMySQL(force) {
    if (!force && !this._isMySQL()) return false;
    try {
      const data = await MySQLBackend.syncAll();
      /* sync เฉพาะตารางที่มีข้อมูล — ป้องกันเขียนทับด้วย array ว่าง */
      if (data.items && data.items.length) this.db.items = data.items;
      if (data.transactions && data.transactions.length) this.db.transactions = data.transactions.map(t => ({ ...t, items: typeof t.items === 'string' ? JSON.parse(t.items) : t.items }));
      if (data.users && data.users.length) this.db.users = data.users;
      if (data.reorderItems && data.reorderItems.length) this.db.reorderItems = data.reorderItems;
      this.save();
      return true;
    } catch (e) { console.error('MySQL sync error:', e); return false; }
  },

  /* Supabase Mode — ดึงข้อมูลจากคลาวด์มาแทนที่ในเครื่อง */
  async syncFromSupabase(force) {
    if (!force && !(typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled)) return false;
    try {
      const data = await SupabaseBackend.pullAll();
      const hasAny = (data.items && data.items.length) || (data.transactions && data.transactions.length);
      if (!hasAny) return { ok: false, empty: true };
      if (data.items && data.items.length) this.db.items = data.items;
      if (data.transactions && data.transactions.length) this.db.transactions = data.transactions.map(t => ({ ...t, items: typeof t.items === 'string' ? JSON.parse(t.items) : t.items }));
      if (data.users && data.users.length) this.db.users = data.users;
      if (data.reorderItems && data.reorderItems.length) this.db.reorderItems = data.reorderItems;
      if (data.seq && data.seq.item) this.db.seq = Object.assign({}, this.db.seq, data.seq);
      this.save();
      return { ok: true };
    } catch (e) { console.error('Supabase sync error:', e); throw e; }
  },

  /* Supabase Mode — อัปโหลดข้อมูลทั้งหมดในเครื่องขึ้นคลาวด์ */
  async syncToSupabase() {
    if (typeof SupabaseBackend === 'undefined' || !SupabaseBackend.url || !SupabaseBackend.key) return false;
    try {
      const n = await SupabaseBackend.pushAll(this.db);
      return n;
    } catch (e) { console.error('Supabase push error:', e); throw e; }
  },

  async syncToMySQL() {
    if (!this._isMySQL()) return false;
    try {
      let count = 0;
      for (const item of this.db.items) { await MySQLBackend.addItem(item); count++; }
      for (const tx of this.db.transactions) { await MySQLBackend.addTransaction(tx); count++; }
      for (const u of this.db.users) { await MySQLBackend.addUser(u); count++; }
      for (const r of (this.db.reorderItems || [])) { await MySQLBackend.addReorder(r); count++; }
      return count;
    } catch (e) { console.error('MySQL push error:', e); return false; }
  },
  /* ส่งขึ้นคลาวด์ตาม backend ที่เปิดอยู่ (Supabase มาก่อน ถ้าเปิด) */
  async _cloudAdd(type, data) {
    if (typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled) {
      try { return await this._supaAdd(type, data); } catch (e) { console.error('Supabase add error:', e); }
    }
    return this._mysqlAdd(type, data);
  },
  async _supaAdd(type, data) {
    if (typeof SupabaseBackend === 'undefined' || !SupabaseBackend.enabled) return;
    try {
      if (type === 'item') await SupabaseBackend.addItem(data);
      else if (type === 'tx') await SupabaseBackend.addTransaction(data);
      else if (type === 'user') await SupabaseBackend.addUser(data);
      else if (type === 'reorder') await SupabaseBackend.addReorder(data);
    } catch (e) { console.error('Supabase add error:', e); }
  },
  async _mysqlAdd(type, data) {
    if (!this._isMySQL()) return;
    try {
      if (type === 'item') await MySQLBackend.addItem(data);
      else if (type === 'tx') await MySQLBackend.addTransaction(data);
      else if (type === 'user') await MySQLBackend.addUser(data);
      else if (type === 'reorder') await MySQLBackend.addReorder(data);
    } catch (e) { console.error('MySQL add error:', e); }
  },
  async _mysqlUpdate(type, id, data) {
    if (typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled) {
      try {
        if (type === 'item') await SupabaseBackend.updateItem(id, data);
        else if (type === 'user') await SupabaseBackend.updateUser(id, data);
        return;
      } catch (e) { console.error('Supabase update error:', e); return; }
    }
    if (!this._isMySQL()) return;
    try {
      if (type === 'item') await MySQLBackend.updateItem(id, data);
      else if (type === 'user') await MySQLBackend.updateUser(id, data);
    } catch (e) { console.error('MySQL update error:', e); }
  },
  async _mysqlDelete(type, id) {
    if (typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled) {
      try {
        if (type === 'item') await SupabaseBackend.deleteItem(id);
        else if (type === 'tx') await SupabaseBackend.deleteTransaction(id);
        else if (type === 'user') await SupabaseBackend.deleteUser(id);
        else if (type === 'reorder') await SupabaseBackend.deleteReorder(id);
        return;
      } catch (e) { console.error('Supabase delete error:', e); return; }
    }
    if (!this._isMySQL()) return;
    try {
      if (type === 'item') await MySQLBackend.deleteItem(id);
      else if (type === 'tx') await MySQLBackend.deleteTransaction(id);
      else if (type === 'user') await MySQLBackend.deleteUser(id);
      else if (type === 'reorder') await MySQLBackend.deleteReorder(id);
    } catch (e) { console.error('MySQL delete error:', e); }
  },

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
    const defaults = ['หมึกพิมพ์', 'อะไหล่วัสดุคอมพิวเตอร์', 'เครื่องมือช่าง', 'อะไหล่วัสดุปริ้นเตอร์', 'วัสดุอุปกรณ์บำรุงต่างๆ', 'อุปกรณ์ต่อพ่วง', 'อุปกรณ์ไฟฟ้า', 'สายไฟฟ้า', 'อุปกรณ์เก็บข้อมูล', 'ทำความสะอาด'];
    const set = new Set(defaults);
    this.db.items.forEach(i => { if (i.category) set.add(i.category); });
    return [...set].sort((a, b) => a.localeCompare(b, 'th-TH', { sensitivity: 'base' }));
  },
  departments() {
    const set = new Set();
    this.db.items.forEach(i => { if (i.group) set.add(i.group); });
    return [...set];
  },

  /* --- รายการต้องสั่งเพิ่ม --- */
  getReorderItems() { return (this.db.reorderItems || []).slice(); },
  addReorderItem(data) {
    if (!this.db.reorderItems) this.db.reorderItems = [];
    const item = Object.assign({ id: uid('ro') }, data);
    this._stamp(item);
    this.db.reorderItems.push(item);
    this.save();
    this._mysqlAdd('reorder', item);
    return item;
  },
  deleteReorderItem(id) {
    this.db.reorderItems = (this.db.reorderItems || []).filter(x => x.id !== id);
    this.save();
    this._mysqlDelete('reorder', id);
  },
  clearReorderItems() { this.db.reorderItems = []; this.save(); if (this._isMySQL()) MySQLBackend.clearReorder().catch(e => console.error(e)); if (typeof SupabaseBackend !== 'undefined' && SupabaseBackend.enabled) SupabaseBackend.clearReorderAll().catch(e => console.error(e)); },
};

/* ---------- ระบบล็อกอิน / เซสชัน ---------- */
const Auth = {
  current() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!s) return null;
      const u = Store.users().find(x => x.id === s.userId);
      if (u) Store._currentUserId = u.id;
      return u || null;
    } catch (e) { return null; }
  },
  login(username, password) {
    const u = Store.findUser(username);
    if (!u || u.password !== hashStr(password)) return null;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: u.id, at: Date.now() }));
    Store._currentUserId = u.id;
    return u;
  },
  logout() { localStorage.removeItem(SESSION_KEY); Store._currentUserId = null; },
  changePassword(userId, cur, np) {
    const u = Store.users().find(x => x.id === userId);
    if (!u || u.password !== hashStr(cur)) return false;
    u.password = hashStr(np);
    Store.save();
    return true;
  },
};
