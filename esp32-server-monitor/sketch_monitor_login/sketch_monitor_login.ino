/*
 * Server Room Monitor — ESP32-243S028 (CYD)
 * มีหน้า Login + Keypad บนจอ
 * แก้ SPI init แล้ว
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <XPT2046_Touchscreen.h>
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
//  Login Password
// ============================================================
#define APP_PASSWORD    ".shsojvp"

// ============================================================
//  Pin Mapping (CYD-2432S028R)
// ============================================================
#define TFT_CS     15
#define TFT_DC     2
#define TFT_RST    12
#define TFT_BL     21
#define TFT_MOSI   13
#define TFT_SCLK   14
#define TOUCH_CS   33
#define TOUCH_IRQ  36
#define DHT_PIN    27
#define DHT_TYPE   DHT22
#define PWR_PIN    34

// ============================================================
//  Touch Calibration
// ============================================================
#define TS_MINX 200
#define TS_MAXX 3800
#define TS_MINY 200
#define TS_MAXY 3800

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
#define C_BG        0x0000
#define C_HEADER    0x1082
#define C_TEXT      0xFFFF
#define C_DIM       0x632C
#define C_GREEN     0x07E0
#define C_RED       0xF800
#define C_YELLOW    0xFFE0
#define C_CYAN      0x07FF
#define C_ORANGE    0xFD20
#define C_PURPLE    0xF81F
#define C_DARK_BG   0x10A2
#define C_CARD_BG   0x2124
#define C_WHITE     0xFFFF
#define C_KEY_BG    0x4208
#define C_KEY_PRESS 0x2104

// ============================================================
//  Objects — ใช้ SPI ตัวเดียว (HSPI bus)
// ============================================================
Adafruit_ILI9341 tft(TFT_CS, TFT_DC, TFT_RST);
XPT2046_Touchscreen touch(TOUCH_CS, TOUCH_IRQ);
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
bool loggedIn = false;
String inputPassword = "";

// ============================================================
//  Keypad Layout
// ============================================================
struct Key {
    int x, y, w, h;
    char label[5];
};

Key keys[] = {
    {10,  80,  65, 45, "1"},
    {85,  80,  65, 45, "2"},
    {160, 80,  65, 45, "3"},
    {10,  135, 65, 45, "4"},
    {85,  135, 65, 45, "5"},
    {160, 135, 65, 45, "6"},
    {10,  190, 65, 45, "7"},
    {85,  190, 65, 45, "8"},
    {160, 190, 65, 45, "9"},
    {10,  245, 65, 45, "."},
    {85,  245, 65, 45, "0"},
    {160, 245, 65, 45, "<"},
    {235, 80,  75, 100, "OK"},
    {235, 190, 75, 100, "C"}
};
int numKeys = sizeof(keys) / sizeof(keys[0]);

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
//  Login Screen UI
// ============================================================
void drawLoginScreen() {
    tft.fillScreen(C_BG);
    
    // Header
    tft.fillRect(0, 0, 320, 60, C_HEADER);
    tft.drawLine(0, 60, 320, 60, C_CYAN);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(60, 10);
    tft.print("SERVER ROOM");
    tft.setCursor(80, 35);
    tft.setTextColor(C_CYAN);
    tft.print("LOGIN");
    
    // Password display
    tft.fillRoundRect(10, 70, 300, 35, 8, C_CARD_BG);
    tft.drawRoundRect(10, 70, 300, 35, 8, C_DIM);
    
    // Draw keypad
    for (int i = 0; i < numKeys; i++) {
        drawKey(i, false);
    }
    
    // Instruction
    tft.setTextSize(1);
    tft.setTextColor(C_DIM);
    tft.setCursor(10, 300);
    tft.print("Password: .shsojvp");
}

void drawKey(int index, bool pressed) {
    Key k = keys[index];
    
    if (pressed) {
        tft.fillRoundRect(k.x, k.y, k.w, k.h, 6, C_KEY_PRESS);
    } else {
        tft.fillRoundRect(k.x, k.y, k.w, k.h, 6, C_KEY_BG);
    }
    tft.drawRoundRect(k.x, k.y, k.w, k.h, 6, C_DIM);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    int textX = k.x + (k.w - strlen(k.label) * 12) / 2;
    int textY = k.y + (k.h - 16) / 2;
    tft.setCursor(textX, textY);
    tft.print(k.label);
}

void updatePasswordDisplay() {
    tft.fillRoundRect(12, 72, 296, 31, 8, C_CARD_BG);
    
    tft.setTextSize(2);
    tft.setTextColor(C_WHITE);
    tft.setCursor(20, 80);
    
    String masked = "";
    for (int i = 0; i < inputPassword.length(); i++) {
        masked += "*";
    }
    tft.print(masked);
    
    tft.setCursor(20 + masked.length() * 12, 80);
    tft.setTextColor(C_CYAN);
    tft.print("_");
}

int getKeyIndex(int x, int y) {
    for (int i = 0; i < numKeys; i++) {
        Key k = keys[i];
        if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) {
            return i;
        }
    }
    return -1;
}

void handleKeyPress(int keyIndex) {
    if (keyIndex < 0) return;
    
    Key k = keys[keyIndex];
    String label = k.label;
    
    // Visual feedback
    drawKey(keyIndex, true);
    delay(100);
    drawKey(keyIndex, false);
    
    if (label == "C") {
        inputPassword = "";
        updatePasswordDisplay();
    } else if (label == "<") {
        if (inputPassword.length() > 0) {
            inputPassword.remove(inputPassword.length() - 1);
            updatePasswordDisplay();
        }
    } else if (label == "OK") {
        if (inputPassword == APP_PASSWORD) {
            loggedIn = true;
            Serial.println("[Login] SUCCESS");
            drawBackground();
            drawHeader();
        } else {
            tft.fillRoundRect(10, 70, 300, 35, 8, C_RED);
            delay(500);
            inputPassword = "";
            updatePasswordDisplay();
            Serial.println("[Login] FAILED");
        }
    } else {
        if (inputPassword.length() < 20) {
            inputPassword += label;
            updatePasswordDisplay();
        }
    }
}

// ============================================================
//  Monitor Screen UI
// ============================================================
void drawBackground() {
    tft.fillScreen(C_BG);
    tft.fillRect(0, 0, 320, 50, C_HEADER);
    tft.drawLine(0, 50, 320, 50, C_CYAN);
    tft.fillRect(0, 280, 320, 40, C_DARK_BG);
    tft.drawLine(0, 280, 320, 280, C_DIM);
}

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

void drawCard(int x, int y, int w, int h, uint16_t borderColor) {
    tft.fillRoundRect(x, y, w, h, 8, C_CARD_BG);
    tft.drawRoundRect(x, y, w, h, 8, borderColor);
}

void drawProgressBar(int x, int y, int w, int h, float value, float maxVal, uint16_t color) {
    int barW = map(value * 10, 0, maxVal * 10, 0, w - 4);
    tft.fillRect(x + 2, y + 2, w - 4, h - 4, C_BG);
    tft.fillRect(x + 2, y + 2, barW, h - 4, color);
    tft.drawRoundRect(x, y, w, h, 4, C_DIM);
}

void drawTempIcon(int x, int y) {
    tft.fillCircle(x + 8, y + 24, 8, C_RED);
    tft.fillRect(x + 4, y + 4, 8, 20, C_RED);
    tft.fillCircle(x + 8, y + 24, 5, C_WHITE);
}

void drawHumidIcon(int x, int y) {
    tft.fillTriangle(x + 8, y + 4, x, y + 20, x + 16, y + 20, C_CYAN);
    tft.fillTriangle(x + 8, y + 8, x + 3, y + 18, x + 13, y + 18, C_WHITE);
}

void drawPowerIcon(int x, int y, bool on) {
    if (on) {
        tft.fillCircle(x + 8, y + 8, 8, C_GREEN);
        tft.drawCircle(x + 8, y + 8, 8, C_WHITE);
    } else {
        tft.fillCircle(x + 8, y + 8, 8, C_RED);
        tft.drawCircle(x + 8, y + 8, 8, C_WHITE);
    }
}

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
//  Touch Handling
// ============================================================
void handleTouch() {
    if (touch.touched()) {
        TS_Point p = touch.getPoint();
        
        int x = map(p.x, TS_MINX, TS_MAXX, 0, 320);
        int y = map(p.y, TS_MINY, TS_MAXY, 0, 240);
        
        if (!loggedIn) {
            int keyIdx = getKeyIndex(x, y);
            handleKeyPress(keyIdx);
        }
    }
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

    // SPI Init — ตั้งค่า pin HSPI ก่อน
    SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);

    // TFT Init
    tft.begin();
    tft.setRotation(1);
    tft.fillScreen(C_BG);

    // Touch Init — ใช้ SPI ตัวเดียวกัน
    touch.begin();
    touch.setRotation(1);

    // DHT Init
    dht.begin();

    // WiFi
    wifiConnect();

    // Draw Login Screen
    drawLoginScreen();

    tBoot = millis();
    tDisplay = millis();

    Serial.println("=== Ready ===\n");
}

// ============================================================
//  LOOP
// ============================================================
void loop() {
    unsigned long now = millis();

    handleTouch();

    if (loggedIn) {
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
            displayTemp();
            displayHumid();
            displayPower();
            displayWifi();
            displayInfo();
            displayFooter();
            tDisplay = now;
        }
    }

    delay(10);
}
