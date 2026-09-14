/*
 * ============================================================
 *  Server Room Monitor — ESP32-243S028 (CYD)
 *  ============================================================
 *
 *  Features:
 *    - DHT22: อุณหภูมิ + ความชื้น
 *    - Optocoupler: ตรวจไฟมา/ดับ
 *    - Firebase Realtime Database
 *    - Telegram notifications
 *    - TFT display (built-in)
 *
 *  Wiring:
 *    - DHT22 DATA → GPIO 4
 *    - Optocoupler OUT → GPIO 34
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <DHT.h>
#include "config.h"

// ============================================================
//  Objects
// ============================================================
Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
DHT dht(DHT_PIN, DHT_TYPE);

// ============================================================
//  State
// ============================================================
struct SensorData {
    float temp;
    float humid;
    bool power;
    bool valid;
    unsigned long ts;
};

SensorData cur  = {0, 0, false, false, 0};
SensorData prev = {0, 0, false, false, 0};

unsigned long tSensor  = 0;
unsigned long tFirebase = 0;
unsigned long tDisplay  = 0;
unsigned long tAlert    = 0;
unsigned long tBoot     = 0;
bool wifiOk = false;

// ============================================================
//  WiFi
// ============================================================
void wifiConnect() {
    Serial.printf("[WiFi] Connecting to %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);

#ifdef WIFI_ENTERPRISE
    // WPA2-Enterprise (identity, username, password)
    WiFi.begin(WIFI_SSID, WPA2_AUTH_PEAP, WIFI_USERNAME, WIFI_USERNAME, WIFI_PASSWORD);
#else
    // Normal WiFi (password only)
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#endif

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
        delay(500);
        Serial.print(".");
    }

    wifiOk = (WiFi.status() == WL_CONNECTED);
    Serial.printf("\n[WiFi] %s IP: %s\n",
                  wifiOk ? "OK" : "FAIL",
                  wifiOk ? WiFi.localIP().toString().c_str() : "N/A");
}

// ============================================================
//  Sensor
// ============================================================
void readSensor() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (isnan(h) || isnan(t)) {
        Serial.println("[DHT] Read failed");
        cur.valid = false;
    } else {
        cur.temp  = t;
        cur.humid = h;
        cur.valid = true;
        Serial.printf("[DHT] T=%.1f°C H=%.1f%%\n", t, h);
    }

    cur.power = (digitalRead(PWR_PIN) == HIGH);
    cur.ts    = millis();

    Serial.printf("[PWR] %s\n", cur.power ? "ON" : "OFF");
}

// ============================================================
//  Firebase
// ============================================================
bool firebasePut() {
    if (!wifiOk) return false;

    HTTPClient http;
    String url = "https://" + String(FIREBASE_HOST)
                 + "/server_monitor.json?auth=" + FIREBASE_AUTH;

    StaticJsonDocument<256> doc;
    doc["temperature"] = round(cur.temp * 10.0) / 10.0;
    doc["humidity"]    = round(cur.humid * 10.0) / 10.0;
    doc["powerOn"]     = cur.power;
    doc["valid"]       = cur.valid;
    doc["uptime"]      = (millis() - tBoot) / 1000;
    doc["timestamp"]   = millis();

    String payload;
    serializeJson(doc, payload);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int code = http.PUT(payload);
    http.end();

    Serial.printf("[Firebase] PUT %d\n", code);
    return (code == 200);
}

bool firebaseHistory() {
    if (!wifiOk) return false;

    HTTPClient http;
    String url = "https://" + String(FIREBASE_HOST)
                 + "/server_monitor_history.json?auth=" + FIREBASE_AUTH;

    StaticJsonDocument<192> doc;
    doc["temperature"] = round(cur.temp * 10.0) / 10.0;
    doc["humidity"]    = round(cur.humid * 10.0) / 10.0;
    doc["powerOn"]     = cur.power;
    doc["ts"]          = millis();

    String payload;
    serializeJson(doc, payload);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(payload);
    http.end();

    return (code == 200);
}

// ============================================================
//  Telegram
// ============================================================
bool tgSend(const String& msg) {
    if (!wifiOk) return false;

    HTTPClient http;
    String url = "https://api.telegram.org/bot" + String(TELEGRAM_BOT) + "/sendMessage";

    StaticJsonDocument<384> doc;
    doc["chat_id"]    = TELEGRAM_CHAT;
    doc["text"]       = msg;
    doc["parse_mode"] = "HTML";

    String payload;
    serializeJson(doc, payload);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(payload);
    http.end();

    Serial.printf("[Telegram] %d\n", code);
    return (code == 200);
}

void checkAlerts() {
    unsigned long now = millis();
    if (now - tAlert < 60000) return;  // cooldown 1 min

    // ไฟดับ
    if (!cur.power && prev.power) {
        String m = "🔴 <b>ไฟฟ้าดับ!</b>\n";
        m += "📍 ห้อง Server\n";
        if (cur.valid) {
            m += "🌡️ " + String(cur.temp, 1) + "°C  💧 " + String(cur.humid, 1) + "%\n";
        }
        m += "⚠️ ตรวจสอบ UPS";
        tgSend(m);
        tAlert = now;
    }

    // ไฟมา
    if (cur.power && !prev.power) {
        String m = "🟢 <b>ไฟฟ้ากลับมาแล้ว!</b>\n";
        m += "📍 ห้อง Server\n";
        if (cur.valid) {
            m += "🌡️ " + String(cur.temp, 1) + "°C  💧 " + String(cur.humid, 1) + "%\n";
        }
        tgSend(m);
        tAlert = now;
    }

    // อุณหภูมิเกิน
    if (cur.valid && cur.temp > TEMP_HIGH && (now - tAlert > 300000)) {
        String m = "🌡️ <b>อุณหภูมิสูง!</b>\n";
        m += "🌡️ <b>" + String(cur.temp, 1) + "°C</b>\n";
        m += "💧 " + String(cur.humid, 1) + "%\n";
        m += "⚠️ ตรวจสอบระบบระบายความร้อน";
        tgSend(m);
        tAlert = now;
    }

    prev = cur;
}

// ============================================================
//  Display
// ============================================================
#define C_BG      0x0000
#define C_HEADER  0x1082
#define C_TEXT    0xFFFF
#define C_DIM     0x4208
#define C_GREEN   0x07E0
#define C_RED     0xF800
#define C_YELLOW  0xFFE0
#define C_CYAN    0x07FF
#define C_ORANGE  0xFD20

void dspInit() {
    SPI.begin(TFT_SCLK_PIN, -1, TFT_MOSI_PIN, -1);
    tft.begin();
    tft.setRotation(1);
    tft.fillScreen(C_BG);
    tft.setTextColor(C_TEXT);
    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.print("SERVER ROOM");
}

void dspHeader() {
    tft.fillRect(0, 0, 320, 32, C_HEADER);
    tft.setTextSize(2);
    tft.setTextColor(C_TEXT);
    tft.setCursor(10, 8);
    tft.print("SERVER ROOM MONITOR");

    // WiFi status
    tft.setTextSize(1);
    tft.setTextColor(wifiOk ? C_GREEN : C_RED);
    tft.setCursor(260, 10);
    tft.print(wifiOk ? "WiFi" : "NO WiFi");
}

void dspPower() {
    int y = 38;
    tft.fillRect(0, y, 320, 40, C_BG);

    tft.setTextSize(2);
    tft.setCursor(10, y + 8);

    if (cur.power) {
        tft.setTextColor(C_GREEN);
        tft.print("POWER: ON ");
    } else {
        tft.setTextColor(C_RED);
        tft.print("POWER: OFF");
    }

    // Uptime
    unsigned long sec = (millis() - tBoot) / 1000;
    int h = sec / 3600;
    int m = (sec % 3600) / 60;
    int s = sec % 60;
    char buf[16];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d", h, m, s);

    tft.setTextSize(1);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, y + 28);
    tft.print("Up ");
    tft.print(buf);
}

void dspTemp() {
    int y = 84;
    tft.fillRect(0, y, 160, 60, C_BG);

    tft.setTextSize(1);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, y + 2);
    tft.print("TEMPERATURE");

    if (cur.valid) {
        uint16_t c = C_YELLOW;
        if (cur.temp > TEMP_HIGH) c = C_RED;
        else if (cur.temp < TEMP_LOW) c = 0x001F;

        tft.setTextSize(3);
        tft.setTextColor(c);
        tft.setCursor(10, y + 16);
        tft.printf("%.1f", cur.temp);
        tft.setTextSize(2);
        tft.print("C");
    } else {
        tft.setTextSize(2);
        tft.setTextColor(C_ORANGE);
        tft.setCursor(10, y + 20);
        tft.print("N/A");
    }
}

void dspHumid() {
    int y = 84;
    tft.fillRect(160, y, 160, 60, C_BG);

    tft.setTextSize(1);
    tft.setTextColor(C_DIM);
    tft.setCursor(170, y + 2);
    tft.print("HUMIDITY");

    if (cur.valid) {
        uint16_t c = C_CYAN;
        if (cur.humid > HUMID_HIGH) c = C_ORANGE;
        else if (cur.humid < HUMID_LOW) c = 0x001F;

        tft.setTextSize(3);
        tft.setTextColor(c);
        tft.setCursor(170, y + 16);
        tft.printf("%.1f", cur.humid);
        tft.setTextSize(2);
        tft.print("%");
    } else {
        tft.setTextSize(2);
        tft.setTextColor(C_ORANGE);
        tft.setCursor(170, y + 20);
        tft.print("N/A");
    }
}

void dspStatus() {
    int y = 152;
    tft.fillRect(0, y, 320, 20, C_BG);

    tft.setTextSize(1);
    tft.setCursor(10, y + 4);

    if (!cur.power) {
        tft.setTextColor(C_RED);
        tft.print("!! POWER OFF !!");
    } else if (cur.valid && cur.temp > TEMP_HIGH) {
        tft.setTextColor(C_RED);
        tft.print("!! HIGH TEMPERATURE !!");
    } else if (cur.valid && cur.humid > HUMID_HIGH) {
        tft.setTextColor(C_ORANGE);
        tft.print("!! HIGH HUMIDITY !!");
    } else {
        tft.setTextColor(C_GREEN);
        tft.print("System Normal");
    }
}

// ============================================================
//  Setup
// ============================================================
void setup() {
    Serial.begin(115200);
    Serial.println("\n=== Server Room Monitor ===\n");

    tBoot = millis();

    // Pins
    pinMode(PWR_PIN, INPUT_PULLDOWN);
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);

    // Init
    dspInit();
    dht.begin();

    // WiFi
    wifiConnect();

    // Print MAC address
    Serial.printf("[WiFi] MAC Address: %s\n", WiFi.macAddress().c_str());

    // First read
    readSensor();

    // Boot message
    if (wifiOk) {
        String m = "🤖 <b>Server Room Monitor</b> started\n";
        m += "🌡️ " + String(cur.temp, 1) + "°C\n";
        m += "💧 " + String(cur.humid, 1) + "%\n";
        m += "⚡ " + String(cur.power ? "ON" : "OFF");
        tgSend(m);
    }

    Serial.println("=== Ready ===\n");
}

// ============================================================
//  Loop
// ============================================================
void loop() {
    unsigned long now = millis();

    // WiFi reconnect
    static unsigned long tWifi = 0;
    if (now - tWifi > WIFI_MS) {
        if (WiFi.status() != WL_CONNECTED) {
            wifiOk = false;
            WiFi.reconnect();
            delay(1000);
            wifiOk = (WiFi.status() == WL_CONNECTED);
        }
        tWifi = now;
    }

    // Sensor
    if (now - tSensor >= SENSOR_MS) {
        readSensor();
        checkAlerts();
        tSensor = now;
    }

    // Firebase
    if (now - tFirebase >= FIREBASE_MS) {
        firebasePut();
        tFirebase = now;

        static unsigned long tHist = 0;
        if (now - tHist >= HISTORY_MS) {
            firebaseHistory();
            tHist = now;
        }
    }

    // Display
    if (now - tDisplay >= DISPLAY_MS) {
        dspHeader();
        dspPower();
        dspTemp();
        dspHumid();
        dspStatus();
        tDisplay = now;
    }

    delay(10);
}
