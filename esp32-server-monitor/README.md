# 🖥️ Server Room Monitor

ระบบ Monitor ห้อง Server ด้วย ESP32-2432S028 (CYD)

## ✨ Features

- ⚡ ตรวจไฟมา/ดับ ผ่าน Optocoupler
- 🌡️ อุณหภูมิ + 💧 ความชื้น จาก DHT22
- 📱 Telegram แจ้งเตือน
- 🔥 Firebase Realtime Database
- 🖥️ TFT Display แสดงผล realtime
- 🌐 Web Dashboard

## 🔌 Wiring

### ESP32-2432S028R (CYD) — Pin Mapping

```
┌─────────────────────────────────────────┐
│           ESP32-2432S028R               │
├─────────────────────────────────────────┤
│                                         │
│  TFT (Built-in)                        │
│  MOSI=13  SCLK=14  CS=15  DC=2        │
│  RST=12   BL=21                        │
│                                         │
│  Touch (Built-in)                      │
│  CS=33  IRQ=36  MOSI=32  MISO=39      │
│                                         │
│  External                              │
│  DHT22 → GPIO 4                        │
│  Optocoupler → GPIO 34                 │
│                                         │
└─────────────────────────────────────────┘
```

### DHT22 Wiring

```
3.3V ───┬─── 10kΩ ───┬─── GPIO 4
        │             │
        └── Pin 1     └── Pin 2 (DATA)

Pin 1 (VCC) → 3.3V
Pin 2 (DATA) → GPIO 4
Pin 3 (NC) → ไม่ต่อ
Pin 4 (GND) → GND
```

### Optocoupler (EL817) — ตรวจไฟ 220V

```
      220V Side              3.3V Side
      
Live ── 470kΩ ──┬── EL817 Pin 1
                 │
Live ── 470kΩ ──┘
                 
Neutral ───────────── EL817 Pin 2

3.3V ── 10kΩ ──┬── GPIO 34
                │
           EL817 Pin 4
                │
           EL817 Pin 3 ── GND

ไฟมา  → GPIO 34 = HIGH
ไฟดับ → GPIO 34 = LOW
```

## 🛒 อุปกรณ์

| # | รายการ | จำนวน | ราคา |
|---|--------|--------|------|
| 1 | ESP32 CYD 2.8" | 1 | ~฿550 |
| 2 | DHT22 (AM2302) | 1 | ~฿80 |
| 3 | EL817 Optocoupler | 1 | ~฿5 |
| 4 | 10kΩ Resistor | 2 | ~฿2 |
| 5 | 470kΩ Resistor | 2 | ~฿2 |
| **รวม** | | | **~฿639** |

## 🚀 Setup

### 1. ตั้งค่า WiFi & Firebase

แก้ไข `src/config.h`:

```cpp
#define WIFI_SSID     "YOUR_WIFI"
#define WIFI_PASSWORD  "YOUR_PASSWORD"
#define FIREBASE_HOST  "cant1280-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH  "YOUR_SECRET"
#define TELEGRAM_BOT   "YOUR_BOT_TOKEN"
#define TELEGRAM_CHAT  "YOUR_CHAT_ID"
```

### 2. Firebase Rules

```json
{
  "rules": {
    "server_monitor": { ".read": true, ".write": true },
    "server_monitor_history": { ".read": true, ".write": true }
  }
}
```

### 3. Telegram Bot

1. คุยกับ `@BotFather` → `/newbot`
2. คัดลอก Token
3. ส่งข้อความหา Bot → เปิด `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. คัดลอก `chat.id`

### 4. Build & Upload

```bash
cd esp32-server-monitor
pio run              # Build
pio run -t upload    # Upload
pio device monitor   # Serial monitor
```

## 📊 Firebase Structure

```
server_monitor: {
    temperature: 28.5,
    humidity: 65.2,
    powerOn: true,
    valid: true,
    uptime: 3600,
    timestamp: 1234567890
}

server_monitor_history: {
    -Nxxx: { temperature, humidity, powerOn, ts }
}
```

## 📱 Telegram Alerts

- 🔴 ไฟดับ
- 🟢 ไฟมา
- 🌡️ อุณหภูมิ > 35°C
- 💧 ความชื้น > 80%

Cooldown: 1 นาที สำหรับ power, 5 นาที สำหรับ temp/humid
