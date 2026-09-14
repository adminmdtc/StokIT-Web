/*
 * Touch Test — CYD-2432S028
 * ใช้ TFT_eSPI + XPT2046_Touchscreen
 */

#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>

#define TOUCH_CS   33
#define TOUCH_IRQ  36

TFT_eSPI tft = TFT_eSPI();
XPT2046_Touchscreen touch(TOUCH_CS, TOUCH_IRQ);

void setup() {
    Serial.begin(115200);
    delay(500);
    
    Serial.println("\n=== Touch Test v4 ===");
    
    // TFT Init
    tft.init();
    tft.setRotation(1);
    tft.fillScreen(TFT_BLACK);
    
    // Touch Init
    touch.begin();
    touch.setRotation(1);
    
    tft.setTextColor(TFT_WHITE);
    tft.setTextSize(2);
    tft.setCursor(10, 10);
    tft.print("Touch Test v4");
    
    tft.setTextSize(1);
    tft.setCursor(10, 40);
    tft.print("Press anywhere on screen");
    tft.setCursor(10, 60);
    tft.print("Check Serial Monitor");
    
    tft.drawLine(150, 0, 150, 240, TFT_CYAN);
    tft.drawLine(0, 120, 320, 120, TFT_CYAN);
    tft.drawCircle(160, 120, 5, TFT_YELLOW);
    
    tft.fillCircle(10, 10, 8, TFT_RED);
    tft.fillCircle(310, 10, 8, TFT_GREEN);
    tft.fillCircle(10, 230, 8, TFT_BLUE);
    tft.fillCircle(310, 230, 8, TFT_YELLOW);
    
    Serial.println("Touch the screen...");
}

void loop() {
    if (touch.touched()) {
        TS_Point p = touch.getPoint();
        
        Serial.print("Raw X=");
        Serial.print(p.x);
        Serial.print(" Y=");
        Serial.print(p.y);
        Serial.print(" Z=");
        Serial.println(p.z);
        
        tft.fillRect(10, 100, 300, 80, TFT_BLACK);
        tft.setTextSize(2);
        tft.setTextColor(TFT_GREEN);
        tft.setCursor(10, 100);
        tft.print("X: ");
        tft.print(p.x);
        tft.setCursor(10, 130);
        tft.print("Y: ");
        tft.print(p.y);
        
        int screenX = map(p.x, 200, 3800, 0, 320);
        int screenY = map(p.y, 200, 3800, 0, 240);
        tft.fillCircle(screenX, screenY, 5, TFT_RED);
    }
    
    delay(50);
}
