/*
 * Server Room Monitor — ESP32-243S028 (CYD)
 * Arduino IDE — แสดงผลภาษาไทย
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
//  Pin Mapping (CYD-2432S028R)
// ============================================================
#define TFT_CS     15
#define TFT_DC     2
#define TFT_RST    12
#define TFT_BL     21
#define TFT_MOSI_PIN 13
#define TFT_SCLK_PIN 14
#define TOUCH_CS   33
#define TOUCH_IRQ  36
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
//  Colors
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
//  Display Functions — ภาษาไทย
// ============================================================
void dspHeader() {
    tft.fillRect(0, 0, 320, 40, C_HEADER);
    tft.setTextSize(2);
    tft.setTextColor(C_TEXT);
    tft.setCursor(20, 12);
    tft.print("SERVER ROOM");
}

void dspPower() {
    uint16_t y = 50;
    tft.setTextSize(2);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, y);
    tft.print("Power: ");
    tft.setTextColor(cur.power ? C_GREEN : C_RED);
    tft.print(cur.power ? "ON " : "OFF");
}

void dspTemp() {
    uint16_t y = 90;
    tft.setTextSize(2);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, y);
    tft.print("Temp: ");

    uint16_t c = C_TEXT;
    if (cur.valid) {
        if (cur.temp > TEMP_HIGH) c = C_RED;
        else if (cur.temp < TEMP_LOW) c = C_YELLOW;
        else c = C_GREEN;
    }
    tft.setTextColor(c);
    tft.print(cur.valid ? String(cur.temp, 1) + " C" : "N/A");
}

void dspHumid() {
    uint16_t y = 130;
    tft.setTextSize(2);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, y);
    tft.print("Humid: ");

    uint16_t c = C_TEXT;
    if (cur.valid) {
        if (cur.humid > HUMID_HIGH) c = C_RED;
        else if (cur.humid < HUMID_LOW) c = C_YELLOW;
        else c = C_GREEN;
    }
    tft.setTextColor(c);
    tft.print(cur.valid ? String(cur.humid, 1) + " %" : "N/A");
}

void dspStatus() {
    uint16_t y = 170;
    tft.setTextSize(1);
    tft.setTextColor(C_DIM);

    String line1 = "WiFi: " + String(wifiOk ? "OK" : "FAIL");
    line1 += "  IP: " + (wifiOk ? WiFi.localIP().toString() : "---");
    tft.setCursor(10, y);
    tft.print(line1);

    unsigned long upSec = (millis() - tBoot) / 1000;
    unsigned long hr = upSec / 3600;
    unsigned long mn = (upSec % 3600) / 60;
    unsigned long sc = upSec % 60;
    char buf[32];
    sprintf(buf, "Uptime: %02lu:%02lu:%02lu", hr, mn, sc);
    tft.setCursor(10, y + 16);
    tft.print(buf);

    tft.setCursor(10, y + 32);
    tft.print("MAC: " + WiFi.macAddress());
}

// ============================================================
//  SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n=== Server Room Monitor ===");

    pinMode(PWR_PIN, INPUT);
    pinMode(TFT_BL, OUTPUT);
    digitalWrite(TFT_BL, HIGH);

    // TFT Init — ใช้ HSPI
    tftSPI.begin(TFT_SCLK_PIN, -1, TFT_MOSI_PIN, TFT_CS);
    tft.begin(&tftSPI);
    tft.setRotation(1);
    tft.fillScreen(C_BG);
    tft.setTextColor(C_CYAN);
    tft.setTextSize(2);
    tft.setCursor(30, 100);
    tft.print("Starting...");

    dht.begin();
    wifiConnect();

    tBoot = millis();
    tDisplay = millis();

    Serial.println("=== Ready ===\n");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    if (now - tSensor >= SENSOR_MS) {
        readSensors();
        checkAlerts();
        tSensor = now;
    }

    if (now - tSensor >= WIFI_MS) {
        wifiCheck();
    }

    if (now - tFirebase >= FIREBASE_MS) {
        firebasePut();
        tFirebase = now;
        static unsigned long tHist = 0;
        if (now - tHist >= HISTORY_MS) {
            firebaseHistory();
            tHist = now;
        }
    }

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
