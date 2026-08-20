# IT Stock — Desktop Application

ระบบบริหารจัดการวัสดุและอุปกรณ์ เวอร์ชัน Desktop

## วิธีติดตั้ง (Developer)

### 1. ติดตั้ง Node.js
- ดาวน์โหลดจาก https://nodejs.org
- เลือก LTS version

### 2. Build ไฟล์ติดตั้ง

**Windows:**
```bash
cd electron
build.bat
```

**Mac/Linux:**
```bash
cd electron
chmod +x build.sh
./build.sh
```

### 3. ไฟล์ Output
จะอยู่ในโฟลเดอร์ `dist/`:
- `IT-Stock-Setup-1.0.0.exe` — ไฟล์ติดตั้ง (NSIS Installer)
- `IT-Stock-Portable-1.0.0.exe` — ไฟล์แบบพกพา (ไม่ต้องติดตั้ง)

## วิธีใช้งาน

### ติดตั้งแบบปกติ
1. ดับเบิลคลิก `IT-Stock-Setup-1.0.0.exe`
2. เลือกโฟลเดอร์ติดตั้ง
3. กด Next จนเสร็จ

### แบบพกพา (Portable)
1. ดับเบิลคลิก `IT-Stock-Portable-1.0.0.exe`
2. ใช้งานได้ทันที ไม่ต้องติดตั้ง

## ข้อมูลล็อกอินเริ่มต้น

| ผู้ใช้ | รหัสผ่าน | บทบาท |
|--------|----------|--------|
| admin | admin123 | ผู้ดูแลระบบ |
| user | user123 | เจ้าหน้าที่ |

## คุณสมบัติ

- ✅ จัดการวัสดุและอุปกรณ์
- ✅ บันทึกรับเข้า/จำหน่าย
- ✅ ติดตาม Serial Number
- ✅ สแกน QR Code / Barcode
- ✅ ออกรายงาน Excel / PDF
- ✅ Import Excel
- ✅ แจ้งเตือน Telegram
- ✅ ป้ายวัสดุ QR Code

## 技术支持

กลุ่มงานเทคโนโลยีสารสนเทศ
