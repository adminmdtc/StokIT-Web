/*
 * Server Room Monitor — ESP32-243S028 (CYD)
 * ใช้ Adafruit ILI9341 (ไม่ต้องตั้งค่า TFT_eSPI)
 * จอทำงานแน่นอน!
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <DHT.h>

// ============================================================
//  WiFi
// ============================================================
#define WIFI_SSID       "Thanyarak"
#define WIFI_PASSWORD   "111111"
// Uncomment ถ้า WiFi ใช้ Enterprise
// #define WIFI_ENTERPRISE
#define WIFI_USERNAME   "mdtc123"

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
//  Pin Mapping (CYD-2432S028R) — สำคัญมาก!
// ============================================================
#define TFT_CS     15
#define TFT_DC     2
#define TFT_RST    12
#define TFT_BL     21
#define TFT_MOSI   13
#define TFT_SCLK   14
#define DHT_PIN    27
#define DHT_TYPE   DHT22
#define PWR_PIN    34

// ============================================================
//  Thresholds
// ============================================================
#define TEMP_HIGH    35.0
#define TEMP_LOW     10.0
#define HUMID_HIGH   80.0
#define HUMID_LOW    30.0

// ============================================================
//  Timing (ms)
// ============================================================
#define SENSOR_MS     5000
#define FIREBASE_MS  10000
#define DISPLAY_MS   1000
#define WIFI_MS      30000
#define HISTORY_MS   60000

// ============================================================
//  สีสัน (RGB565)
// ============================================================
#define C_BG        0x0000   // ดำ
#define C_HEADER    0x1082   // น้ำเงินเข้ม
#define C_TEXT      0xFFFF   // ขาว
#define C_DIM       0x632C   // เทา
#define C_GREEN     0x07E0   // เขียว
#define C_RED       0xF800   // แดง
#define C_YELLOW    0xFFE0   // เหลือง
#define C_CYAN      0x07FF   // ฟ้า
#define C_ORANGE    0xFD20   // ส้ม
#define C_PURPLE    0xF81F   // ม่วง
#define C_DARK_BG   0x10A2   // พื้นหลังเข้ม
#define C_CARD_BG   0x2124   // สีการ์ด
#define C_WHITE     0xFFFF   // ขาว

// ============================================================
//  Objects — ใช้ HSPI สำหรับจอ CYD
// ============================================================
SPIClass tftSPI(HSPI);
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
//  WiFi Connect
// ============================================================
void wifiConnect() {
    Serial.printf("[WiFi] Connecting to %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);

#ifdef WIFI_ENTERPRISE
    WiFi.begin(WIFI_SSID, WPA2_AUTH_PEAP, WIFI_USERNAME, WIFI_USERNAME, WIFI_PASSWORD);
#else
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
#endif

    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 40) {
        delay(500);
        Serial.print(".");
        tries++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        wifiOk = true;
        Serial.printf("\n[WiFi] OK IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WiFi] MAC Address: %s\n", WiFi.macAddress().c_str());
    } else {
        wifiOk = false;
        Serial.println("\n[WiFi] FAILED");
    }
}

// ============================================================
//  WiFi Auto-Reconnect
// ============================================================
void wifiCheck() {
    if (WiFi.status() != WL_CONNECTED) {
        wifiOk = false;
        Serial.println("[WiFi] Lost, reconnecting...");
        WiFi.disconnect();
        wifiConnect();
    }
}

// ============================================================
//  DHT Read
// ============================================================
void readSensors() {
    float t = dht.readTemperature();
    float h = dht.readHumidity();

    cur.ts = millis();
    cur.power = (digitalRead(PWR_PIN) == HIGH);

    if (!isnan(t) && !isnan(h)) {
        cur.temp = t;
        cur.humid = h;
        cur.valid = true;
        Serial.printf("[DHT] T=%.1f C H=%.1f %%\n", t, h);
    } else {
        cur.valid = false;
        Serial.println("[DHT] Read error");
    }

    Serial.printf("[PWR] %s\n", cur.power ? "ON" : "OFF");
}

// ============================================================
//  Telegram Send
// ============================================================
void telegramSend(String msg) {
    if (!wifiOk) return;
    if (strlen(TELEGRAM_BOT) < 10) return;

    String url = "https://api.telegram.org/bot" + String(TELEGRAM_BOT) + "/sendMessage";
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    String payload = "{\"chat_id\":\"" + String(TELEGRAM_CHAT) + "\",\"text\":\"" + msg + "\"}";
    int code = http.POST(payload);
    http.end();

    Serial.printf("[Telegram] %d\n", code);
}

// ============================================================
//  Alert Check
// ============================================================
void checkAlerts() {
    if (!cur.valid) return;
    if (millis() - tAlert < 120000) return;

    String msg = "";

    if (cur.temp > TEMP_HIGH) {
        msg += "HIGH TEMP: " + String(cur.temp, 1) + "C\n";
    } else if (cur.temp < TEMP_LOW) {
        msg += "LOW TEMP: " + String(cur.temp, 1) + "C\n";
    }

    if (cur.humid > HUMID_HIGH) {
        msg += "HIGH HUMIDITY: " + String(cur.humid, 1) + "%\n";
    } else if (cur.humid < HUMID_LOW) {
        msg += "LOW HUMIDITY: " + String(cur.humid, 1) + "%\n";
    }

    if (!cur.power) {
        msg += "POWER OFF!\n";
    }

    if (msg.length() > 0) {
        telegramSend("ALERT - Server Room:\n" + msg);
        tAlert = millis();
    }
}

// ============================================================
//  Firebase PUT
// ============================================================
void firebasePut() {
    if (!wifiOk || !cur.valid) return;

    String url = "https://" + String(FIREBASE_HOST) + ".firebaseio.com/current.json?auth=" + String(FIREBASE_AUTH);
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["temp"]     = serialized(String(cur.temp, 1));
    doc["humid"]    = serialized(String(cur.humid, 1));
    doc["power"]    = cur.power;
    doc["mac"]      = WiFi.macAddress();
    doc["ip"]       = WiFi.localIP().toString();
    doc["uptime"]   = (millis() - tBoot) / 1000;
    doc["updated"]  = millis() / 1000;

    String body;
    serializeJson(doc, body);

    int code = http.PUT(body);
    http.end();

    Serial.printf("[Firebase] PUT %d\n", code);
}

// ============================================================
//  Firebase History
// ============================================================
void firebaseHistory() {
    if (!wifiOk || !cur.valid) return;

    String ts = String(millis() / 1000);
    String url = "https://" + String(FIREBASE_HOST) + ".firebaseio.com/history/" + ts + ".json?auth=" + String(FIREBASE_AUTH);
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<128> doc;
    doc["temp"]  = serialized(String(cur.temp, 1));
    doc["humid"] = serialized(String(cur.humid, 1));
    doc["power"] = cur.power;

    String body;
    serializeJson(doc, body);

    int code = http.PUT(body);
    http.end();

    Serial.printf("[History] PUT %d\n", code);
}

// ============================================================
//  UI Functions — ออกแบบสวยๆ
// ============================================================

// วาดพื้นหลัง
void drawBackground() {
    tft.fillScreen(C_BG);
    tft.fillRect(0, 0, 320, 50, C_HEADER);
    tft.drawLine(0, 50, 320, 50, C_CYAN);
    tft.fillRect(0, 280, 320, 40, C_DARK_BG);
    tft.drawLine(0, 280, 320, 280, C_DIM);
}

// วาด Header
void drawHeader() {
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(10, 8);
    tft.print("SERVER ROOM");
    tft.setCursor(10, 28);
    tft.setTextSize(1);
    tft.setTextColor(C_CYAN);
    tft.print("Environmental Monitor");
}

// วาด Card
void drawCard(int x, int y, int w, int h, uint16_t borderColor) {
    tft.fillRoundRect(x, y, w, h, 8, C_CARD_BG);
    tft.drawRoundRect(x, y, w, h, 8, borderColor);
}

// วาด Progress Bar
void drawProgressBar(int x, int y, int w, int h, float value, float maxVal, uint16_t color) {
    int barW = map(value * 10, 0, maxVal * 10, 0, w - 4);
    tft.fillRect(x + 2, y + 2, w - 4, h - 4, C_BG);
    tft.fillRect(x + 2, y + 2, barW, h - 4, color);
    tft.drawRoundRect(x, y, w, h, 4, C_DIM);
}

// วาดไอคอนอุณหภูมิ
void drawTempIcon(int x, int y) {
    tft.fillCircle(x + 8, y + 24, 8, C_RED);
    tft.fillRect(x + 4, y + 4, 8, 20, C_RED);
    tft.fillCircle(x + 8, y + 24, 5, C_WHITE);
}

// วาดไอคอนความชื้น
void drawHumidIcon(int x, int y) {
    tft.fillTriangle(x + 8, y + 4, x, y + 20, x + 16, y + 20, C_CYAN);
    tft.fillTriangle(x + 8, y + 8, x + 3, y + 18, x + 13, y + 18, C_WHITE);
}

// วาดไอคอนไฟ
void drawPowerIcon(int x, int y, bool on) {
    if (on) {
        tft.fillCircle(x + 8, y + 8, 8, C_GREEN);
        tft.drawCircle(x + 8, y + 8, 8, C_WHITE);
    } else {
        tft.fillCircle(x + 8, y + 8, 8, C_RED);
        tft.drawCircle(x + 8, y + 8, 8, C_WHITE);
    }
}

// แสดงอุณหภูมิ
void displayTemp() {
    int x = 10, y = 60, w = 150, h = 90;
    drawCard(x, y, w, h, C_RED);
    drawTempIcon(x + 10, y + 20);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(x + 35, y + 15);
    tft.print("TEMP");
    
    tft.setTextSize(3);
    if (cur.valid) {
        uint16_t c = (cur.temp > TEMP_HIGH) ? C_RED : 
                    (cur.temp < TEMP_LOW) ? C_YELLOW : C_GREEN;
        tft.setTextColor(c);
        tft.setCursor(x + 35, y + 40);
        tft.print(String(cur.temp, 1));
        tft.setTextSize(2);
        tft.print(" C");
    } else {
        tft.setTextColor(C_DIM);
        tft.setCursor(x + 35, y + 40);
        tft.print("N/A");
    }
    drawProgressBar(x + 10, y + 70, w - 20, 10, cur.temp, 50, C_RED);
}

// แสดงความชื้น
void displayHumid() {
    int x = 165, y = 60, w = 150, h = 90;
    drawCard(x, y, w, h, C_CYAN);
    drawHumidIcon(x + 10, y + 20);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(x + 35, y + 15);
    tft.print("HUMID");
    
    tft.setTextSize(3);
    if (cur.valid) {
        uint16_t c = (cur.humid > HUMID_HIGH) ? C_RED : 
                    (cur.humid < HUMID_LOW) ? C_YELLOW : C_GREEN;
        tft.setTextColor(c);
        tft.setCursor(x + 35, y + 40);
        tft.print(String(cur.humid, 1));
        tft.setTextSize(2);
        tft.print(" %");
    } else {
        tft.setTextColor(C_DIM);
        tft.setCursor(x + 35, y + 40);
        tft.print("N/A");
    }
    drawProgressBar(x + 10, y + 70, w - 20, 10, cur.humid, 100, C_CYAN);
}

// แสดงสถานะไฟ
void displayPower() {
    int x = 10, y = 160, w = 150, h = 60;
    drawCard(x, y, w, h, cur.power ? C_GREEN : C_RED);
    drawPowerIcon(x + 15, y + 20, cur.power);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(x + 35, y + 15);
    tft.print("POWER");
    
    tft.setTextSize(2);
    tft.setTextColor(cur.power ? C_GREEN : C_RED);
    tft.setCursor(x + 35, y + 35);
    tft.print(cur.power ? "ON" : "OFF");
}

// แสดงสถานะ WiFi
void displayWifi() {
    int x = 165, y = 160, w = 150, h = 60;
    drawCard(x, y, w, h, wifiOk ? C_GREEN : C_RED);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(x + 10, y + 15);
    tft.print("WIFI");
    
    tft.setTextSize(2);
    tft.setTextColor(wifiOk ? C_GREEN : C_RED);
    tft.setCursor(x + 10, y + 35);
    tft.print(wifiOk ? "OK" : "FAIL");
    
    if (wifiOk) {
        tft.setTextSize(1);
        tft.setTextColor(C_DIM);
        tft.setCursor(x + 80, y + 38);
        tft.print(WiFi.localIP().toString());
    }
}

// แสดงข้อมูลเพิ่มเติม
void displayInfo() {
    int x = 10, y = 230, w = 300, h = 40;
    drawCard(x, y, w, h, C_PURPLE);
    
    unsigned long upSec = (millis() - tBoot) / 1000;
    unsigned long hr = upSec / 3600;
    unsigned long mn = (upSec % 3600) / 60;
    unsigned long sc = upSec % 60;
    char buf[32];
    sprintf(buf, "UP: %02lu:%02lu:%02lu", hr, mn, sc);
    
    tft.setTextSize(1);
    tft.setTextColor(C_WHITE);
    tft.setCursor(x + 10, y + 10);
    tft.print(buf);
    
    tft.setCursor(x + 10, y + 25);
    tft.setTextColor(C_DIM);
    tft.print("MAC: " + WiFi.macAddress());
}

// แสดง Footer
void displayFooter() {
    tft.setTextSize(1);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, 290);
    tft.print("Server Room Monitor v1.0");
    
    unsigned long sec = millis() / 1000;
    tft.setCursor(250, 290);
    tft.print(String(sec) + "s");
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n=== Server Room Monitor ===");

    // GPIO
    pinMode(PWR_PIN, INPUT);
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);

    // TFT Init — ใช้ HSPI
    tftSPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);
    tft.begin(&tftSPI);
    tft.setRotation(1);
    tft.fillScreen(C_BG);
    
    // แสดง Loading
    tft.setTextSize(2);
    tft.setTextColor(C_CYAN);
    tft.setCursor(30, 100);
    tft.print("Starting...");
    
    tft.setTextSize(1);
    tft.setTextColor(C_DIM);
    tft.setCursor(30, 120);
    tft.print("Please wait...");

    // DHT Init
    dht.begin();

    // WiFi
    wifiConnect();

    // วาด UI
    drawBackground();
    drawHeader();

    tBoot = millis();
    tDisplay = millis();

    Serial.println("=== Ready ===\n");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    // Sensor Read
    if (now - tSensor >= SENSOR_MS) {
        readSensors();
        checkAlerts();
        tSensor = now;
    }

    // WiFi Check
    if (now - tSensor >= WIFI_MS) {
        wifiCheck();
    }

    // Firebase Update
    if (now - tFirebase >= FIREBASE_MS) {
        firebasePut();
        tFirebase = now;
        static unsigned long tHist = 0;
        if (now - tHist >= HISTORY_MS) {
            firebaseHistory();
            tHist = now;
        }
    }

    // Display Update
    if (now - tDisplay >= DISPLAY_MS) {
        displayTemp();
        displayHumid();
        displayPower();
        displayWifi();
        displayInfo();
        displayFooter();
        tDisplay = now;
    }

    delay(10);
}
