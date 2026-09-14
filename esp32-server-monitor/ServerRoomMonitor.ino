/*
 * ============================================================
 *  Server Room Monitor — ESP32-243S028 (CYD)
 *  สำหรับ Arduino IDE 2.x
 * ============================================================
 *
 *  ต้องติดตั้ง Library ผ่าน Library Manager:
 *    - Adafruit ILI9341
 *    - DHT sensor library (by Adafruit)
 *    - Adafruit Unified Sensor
 *    - ArduinoJson
 *
 *  Board: ESP32 Dev Module
 *  Partition Scheme: Default 4MB
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ============================================================
//  CONFIGURATION — แก้ไขตรงนี้
// ============================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD  = "YOUR_WIFI_PASSWORD";

const char* FIREBASE_HOST  = "cant1280-default-rtdb.firebaseio.com";
const char* FIREBASE_AUTH  = "YOUR_DATABASE_SECRET";

const char* TELEGRAM_BOT   = "YOUR_BOT_TOKEN";
const char* TELEGRAM_CHAT  = "YOUR_CHAT_ID";

// ============================================================
//  PIN CONFIGURATION
// ============================================================
#define DHT_PIN     4       // DHT22 DATA pin
#define DHT_TYPE    DHT22
#define POWER_PIN   34      // Optocoupler output

// ============================================================
//  THRESHOLDS
// ============================================================
#define TEMP_HIGH     35.0
#define TEMP_LOW      10.0
#define HUMID_HIGH    80.0
#define HUMID_LOW     30.0

// ============================================================
//  TIMING (ms)
// ============================================================
#define SENSOR_INTERVAL    5000
#define FIREBASE_INTERVAL 10000
#define WIFI_TIMEOUT      15000

// ============================================================
//  OBJECTS
// ============================================================
DHT dht(DHT_PIN, DHT_TYPE);

// ============================================================
//  VARIABLES
// ============================================================
float temperature = 0;
float humidity = 0;
bool powerOn = false;
bool sensorValid = false;

bool lastPowerOn = false;
bool wifiConnected = false;

unsigned long lastSensorRead = 0;
unsigned long lastFirebaseSync = 0;
unsigned long lastAlert = 0;
unsigned long bootTime = 0;

// ============================================================
//  WiFi
// ============================================================
void wifiConnect() {
    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT) {
        delay(500);
        Serial.print(".");
    }

    wifiConnected = (WiFi.status() == WL_CONNECTED);
    if (wifiConnected) {
        Serial.printf("\n[WiFi] OK - IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] FAILED");
    }
}

void wifiReconnect() {
    if (WiFi.status() != WL_CONNECTED) {
        wifiConnected = false;
        WiFi.reconnect();
        delay(2000);
        wifiConnected = (WiFi.status() == WL_CONNECTED);
    }
}

// ============================================================
//  Read Sensors
// ============================================================
void readSensors() {
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (isnan(h) || isnan(t)) {
        Serial.println("[DHT] Read failed!");
        sensorValid = false;
    } else {
        temperature = t;
        humidity = h;
        sensorValid = true;
        Serial.printf("[DHT] Temp: %.1f°C  Humidity: %.1f%%\n", t, h);
    }

    powerOn = (digitalRead(POWER_PIN) == HIGH);
    Serial.printf("[Power] %s (raw: %d)\n", powerOn ? "ON" : "OFF", digitalRead(POWER_PIN));
}

// ============================================================
//  Firebase — Send Data
// ============================================================
bool sendToFirebase() {
    if (!wifiConnected) return false;

    HTTPClient http;
    String url = "https://" + String(FIREBASE_HOST) + "/server_monitor.json?auth=" + FIREBASE_AUTH;

    StaticJsonDocument<256> doc;
    doc["temperature"] = round(temperature * 10.0) / 10.0;
    doc["humidity"] = round(humidity * 10.0) / 10.0;
    doc["powerOn"] = powerOn;
    doc["valid"] = sensorValid;
    doc["uptime"] = (millis() - bootTime) / 1000;
    doc["timestamp"] = millis();

    String payload;
    serializeJson(doc, payload);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int code = http.PUT(payload);
    http.end();

    Serial.printf("[Firebase] PUT %d\n", code);
    return (code == 200);
}

bool sendHistory() {
    if (!wifiConnected) return false;

    HTTPClient http;
    String url = "https://" + String(FIREBASE_HOST) + "/server_monitor_history.json?auth=" + FIREBASE_AUTH;

    StaticJsonDocument<192> doc;
    doc["temperature"] = round(temperature * 10.0) / 10.0;
    doc["humidity"] = round(humidity * 10.0) / 10.0;
    doc["powerOn"] = powerOn;
    doc["ts"] = millis();

    String payload;
    serializeJson(doc, payload);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int code = http.POST(payload);
    http.end();

    return (code == 200);
}

// ============================================================
//  Telegram — Send Alert
// ============================================================
bool sendTelegram(const String& message) {
    if (!wifiConnected) return false;

    HTTPClient http;
    String url = "https://api.telegram.org/bot" + String(TELEGRAM_BOT) + "/sendMessage";

    StaticJsonDocument<384> doc;
    doc["chat_id"] = TELEGRAM_CHAT;
    doc["text"] = message;
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

    // ไฟดับ
    if (!powerOn && lastPowerOn) {
        if (now - lastAlert > 60000) {
            String msg = "🔴 <b>ไฟฟ้าดับ!</b>\n\n";
            msg += "📍 ห้อง Server\n";
            if (sensorValid) {
                msg += "🌡️ " + String(temperature, 1) + "°C\n";
                msg += "💧 " + String(humidity, 1) + "%\n";
            }
            msg += "⚠️ ตรวจสอบ UPS";
            sendTelegram(msg);
            lastAlert = now;
        }
    }

    // ไฟมา
    if (powerOn && !lastPowerOn) {
        if (now - lastAlert > 60000) {
            String msg = "🟢 <b>ไฟฟ้ากลับมาแล้ว!</b>\n\n";
            msg += "📍 ห้อง Server\n";
            if (sensorValid) {
                msg += "🌡️ " + String(temperature, 1) + "°C\n";
                msg += "💧 " + String(humidity, 1) + "%\n";
            }
            sendTelegram(msg);
            lastAlert = now;
        }
    }

    // อุณหภูมิเกิน
    if (sensorValid && temperature > TEMP_HIGH) {
        if (now - lastAlert > 300000) {
            String msg = "🌡️ <b>อุณหภูมิสูง!</b>\n\n";
            msg += "🌡️ <b>" + String(temperature, 1) + "°C</b>\n";
            msg += "💧 " + String(humidity, 1) + "%\n";
            msg += "⚠️ ตรวจสอบระบบระบายความร้อน";
            sendTelegram(msg);
            lastAlert = now;
        }
    }

    // ความชื้นเกิน
    if (sensorValid && humidity > HUMID_HIGH) {
        if (now - lastAlert > 300000) {
            String msg = "💧 <b>ความชื้นสูง!</b>\n\n";
            msg += "🌡️ " + String(temperature, 1) + "°C\n";
            msg += "💧 <b>" + String(humidity, 1) + "%</b>\n";
            msg += "⚠️ ตรวจสอบระบบแอร์";
            sendTelegram(msg);
            lastAlert = now;
        }
    }

    lastPowerOn = powerOn;
}

// ============================================================
//  Setup
// ============================================================
void setup() {
    Serial.begin(115200);
    Serial.println("\n=== Server Room Monitor ===\n");

    bootTime = millis();

    // Pin mode
    pinMode(POWER_PIN, INPUT_PULLDOWN);

    // Init DHT
    dht.begin();

    // Connect WiFi
    wifiConnect();

    // First read
    readSensors();

    // Boot message
    if (wifiConnected) {
        String msg = "🤖 <b>Server Room Monitor</b> started\n\n";
        msg += "🌡️ " + String(temperature, 1) + "°C\n";
        msg += "💧 " + String(humidity, 1) + "%\n";
        msg += "⚡ " + String(powerOn ? "ON" : "OFF");
        sendTelegram(msg);
    }

    Serial.println("=== Ready ===\n");
}

// ============================================================
//  Loop
// ============================================================
void loop() {
    unsigned long now = millis();

    // WiFi reconnect
    static unsigned long lastWifiCheck = 0;
    if (now - lastWifiCheck > 30000) {
        wifiReconnect();
        lastWifiCheck = now;
    }

    // Read sensors
    if (now - lastSensorRead >= SENSOR_INTERVAL) {
        readSensors();
        checkAlerts();
        lastSensorRead = now;
    }

    // Send to Firebase
    if (now - lastFirebaseSync >= FIREBASE_INTERVAL) {
        sendToFirebase();
        lastFirebaseSync = now;

        // History (every 60s)
        static unsigned long lastHistory = 0;
        if (now - lastHistory >= 60000) {
            sendHistory();
            lastHistory = now;
        }
    }

    delay(10);
}
