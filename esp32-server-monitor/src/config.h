/*
 * ============================================================
 *  config.h — Server Room Monitor
 *  ตั้งค่าทั้งหมดอยู่ในไฟล์นี้
 * ============================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// ============================================================
//  WiFi
// ============================================================
#define WIFI_SSID       "Thanyarak"
#define WIFI_PASSWORD   "Confrernce"

// WPA2-Enterprise (ต้องใส่ username)
#define WIFI_ENTERPRISE
#define WIFI_USERNAME   "Confrernce"

// ============================================================
//  Firebase
// ============================================================
#define FIREBASE_HOST   "server-room-28b3a-default-rtdb"
#define FIREBASE_AUTH   "v12Ey1pJmts1wkpnSdVfC5B09sJY092huJ2QW9Wb"

// ============================================================
//  Telegram
// ============================================================
#define TELEGRAM_BOT    "7905485976:AAH7qMGV92xC79dlQDWGICcsQiAyRYdjQag"
#define TELEGRAM_CHAT   "7516582701"

// ============================================================
//  Pin Mapping (CYD-2432S028R)
// ============================================================
// TFT Display (built-in)
#define TFT_CS     15
#define TFT_DC     2
#define TFT_RST    12
#define TFT_BL     21
#define TFT_MOSI_PIN 13
#define TFT_SCLK_PIN 14

// Touch (built-in)
#define TOUCH_CS  33
#define TOUCH_IRQ 36

// Sensors
#define DHT_PIN   4       // DHT22 data
#define DHT_TYPE  DHT22
#define PWR_PIN   34      // Optocoupler (input only)

// ============================================================
//  Thresholds
// ============================================================
#define TEMP_HIGH    35.0   // °C
#define TEMP_LOW     10.0   // °C
#define HUMID_HIGH   80.0   // %
#define HUMID_LOW    30.0   // %

// ============================================================
//  Timing (ms)
// ============================================================
#define SENSOR_MS     5000
#define FIREBASE_MS  10000
#define DISPLAY_MS   1000
#define WIFI_MS      30000
#define HISTORY_MS   60000

#endif
