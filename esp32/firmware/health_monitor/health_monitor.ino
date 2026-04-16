/*
 * ============================================================
 * AI HEALTH MONITOR — ESP32-S3 N8R2 Firmware  v2.0
 * ============================================================
 * NEW IN v2.0:
 *   - Water reminder: shown on OLED + 2 short vibrations
 *   - Medicine reminder: shown on OLED + 3 long vibrations
 *   - Polls /api/reminders/pending every 5 seconds
 *   - Live GPS location sent in SMS alerts via backend
 *
 * Hardware:
 *   ESP32-S3 N8R2 | TCA9548A | MAX30102 | MLX90614
 *   MPU6050 | GSR (GPIO4) | SSD1306 OLED | Vibration motor (GPIO5)
 *
 * Wiring (TCA9548A channels):
 *   Ch0 → MAX30102   Ch1 → MLX90614
 *   Ch2 → MPU6050    Ch3 → SSD1306 OLED
 * ============================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include "heartRate.h"
#include <MPU6050.h>
const char* WIFI_SSID     = "shanthu";
const char* WIFI_PASSWORD = "22222222";
const char* SERVER_URL = "https://umpire-charger-chosen.ngrok-free.dev";  // your PC local IP

// ─── PINS ──────────────────────────────────────────────────────────────────
#define SDA_PIN         8
#define SCL_PIN         9
#define TCA_ADDR        0x70
#define GSR_PIN         4
#define VIBRATION_PIN   5
#define BATTERY_PIN     3

// ─── OLED ──────────────────────────────────────────────────────────────────
#define SCREEN_W  128
#define SCREEN_H  64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);

// ─── SENSOR OBJECTS ────────────────────────────────────────────────────────
Adafruit_MLX90614 mlx;
MAX30105 particleSensor;
MPU6050  mpu;

// ─── LIVE DATA ─────────────────────────────────────────────────────────────
float   bodyTemperature = 0.0, ambientTemperature = 0.0;
int32_t heartRate = 0;     int8_t validHeartRate = 0;
int32_t spo2 = 0;          int8_t validSPO2 = 0;
int     gsrRaw = 0;        float  gsrResistance = 0;
int16_t ax, ay, az, gx, gy, gz;

// ─── STEP COUNTER ──────────────────────────────────────────────────────────
long     stepCount    = 0;
float    prevMag      = 0;
unsigned long lastStepTime = 0;
const float STEP_THRESHOLD = 1.2;
const int   STEP_COOLDOWN  = 250;

// ─── MAX30102 BUFFERS ───────────────────────────────────────────────────────
uint32_t irBuffer[100], redBuffer[100];

// ─── TIMERS ─────────────────────────────────────────────────────────────────
unsigned long lastSendMs     = 0;   const int SEND_INTERVAL   = 2000;
unsigned long lastPollMs     = 0;   const int POLL_INTERVAL   = 5000;
unsigned long lastPageMs     = 0;   const int PAGE_INTERVAL   = 3500;
unsigned long reminderEndMs  = 0;   const int REMINDER_SHOW_MS= 8000;
int  displayPage = 0;

// ─── REMINDER STATE ─────────────────────────────────────────────────────────
bool    reminderActive  = false;
String  reminderMessage = "";
String  reminderType    = "";        // "water" or "medicine"
unsigned long reminderStartMs = 0;

// ─── ALERT STATE ────────────────────────────────────────────────────────────
bool alertActive = false;
unsigned long alertStartMs = 0;

// ─── TCA HELPERS ────────────────────────────────────────────────────────────
void tcaSelect(uint8_t ch) {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(1 << ch);
  Wire.endTransmission();
  delay(5);
}
void tcaDeselect() {
  Wire.beginTransmission(TCA_ADDR);
  Wire.write(0);
  Wire.endTransmission();
}

// ─── WIFI ────────────────────────────────────────────────────────────────────
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  int t = 0;
  while (WiFi.status() != WL_CONNECTED && t++ < 30) {
    delay(500); Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED
    ? "\n✅ " + WiFi.localIP().toString()
    : "\n⚠️  Offline mode");
}

// ─── VIBRATION PATTERNS ──────────────────────────────────────────────────────
void vibrateAlert() {           // 3 short — health alert
  for (int i = 0; i < 3; i++) {
    digitalWrite(VIBRATION_PIN, HIGH); delay(200);
    digitalWrite(VIBRATION_PIN, LOW);  delay(100);
  }
}
void vibrateWater() {           // 2 gentle pulses — water
  for (int i = 0; i < 2; i++) {
    digitalWrite(VIBRATION_PIN, HIGH); delay(300);
    digitalWrite(VIBRATION_PIN, LOW);  delay(200);
  }
}
void vibrateMedicine() {        // 3 long pulses — medicine
  for (int i = 0; i < 3; i++) {
    digitalWrite(VIBRATION_PIN, HIGH); delay(500);
    digitalWrite(VIBRATION_PIN, LOW);  delay(200);
  }
}

// ─── SEND SENSOR DATA ────────────────────────────────────────────────────────
void testConnectivity() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected");
    return;
  }
  
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/sensors/ping";
  Serial.printf("🔍 Testing connectivity to: %s\n", url.c_str());
  
  http.begin(url);
  http.setTimeout(5000);
  
  int code = http.GET();
  Serial.printf("📶 Ping response: %d\n", code);
  
  if (code == 200) {
    String payload = http.getString();
    Serial.printf("✅ Server response: %s\n", payload.c_str());
  } else if (code < 0) {
    Serial.printf("❌ Connection failed: %s\n", http.errorToString(code).c_str());
  }
  
  http.end();
}

// ─── SEND SENSOR DATA ────────────────────────────────────────────────────────
void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected, skipping POST");
    return;
  }
  
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/sensors/data";
  Serial.printf("📡 Posting to: %s\n", url.c_str());
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);  // 5 second timeout

  StaticJsonDocument<512> doc;
  doc["heartRate"]   = (validHeartRate && heartRate > 30 && heartRate < 200) ? heartRate : 0;
  doc["spo2"]        = (validSPO2 && spo2 > 70) ? spo2 : 0;
  doc["temperature"] = round(bodyTemperature * 10.0) / 10.0;
  doc["gsrValue"]    = gsrRaw;
  doc["accelX"]      = round((ax / 16384.0) * 1000.0) / 1000.0;
  doc["accelY"]      = round((ay / 16384.0) * 1000.0) / 1000.0;
  doc["accelZ"]      = round((az / 16384.0) * 1000.0) / 1000.0;
  doc["gyroX"]       = round((gx / 131.0)   * 100.0)  / 100.0;
  doc["gyroY"]       = round((gy / 131.0)   * 100.0)  / 100.0;
  doc["gyroZ"]       = round((gz / 131.0)   * 100.0)  / 100.0;
  doc["steps"]       = stepCount;
  doc["battery"]     = getBattery();

  String body; 
  serializeJson(doc, body);
  Serial.printf("📦 JSON: %s\n", body.c_str());
  
  int code = http.POST(body);
  Serial.printf("📤 POST response: %d\n", code);
  
  if (code < 0) {
    Serial.printf("❌ POST failed: %s\n", http.errorToString(code).c_str());
  } else if (code == 200) {
    Serial.println("✅ Data received by server");
  } else {
    Serial.printf("⚠️  Server response: %d\n", code);
  }
  
  http.end();
}

// ─── POLL REMINDER QUEUE ──────────────────────────────────────────────────────
void pollReminders() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(SERVER_URL) + "/api/reminders/pending");
  int code = http.GET();
  if (code != 200) { http.end(); return; }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, payload)) return;

  int count = doc["count"] | 0;
  if (count == 0) return;

  JsonArray items = doc["items"].as<JsonArray>();
  for (JsonObject item : items) {
    String type = item["type"] | "water";
    String msg  = item["message"] | "";

    Serial.printf("🔔 Reminder [%s]: %s\n", type.c_str(), msg.c_str());

    // Show on OLED for REMINDER_SHOW_MS ms
    reminderActive   = true;
    reminderType     = type;
    reminderMessage  = msg;
    reminderStartMs  = millis();

    // Vibrate based on type
    if (type == "water")    vibrateWater();
    else                    vibrateMedicine();

    // Only process first one per poll cycle (avoid overloading OLED)
    break;
  }
}

// ─── OLED DISPLAY ────────────────────────────────────────────────────────────
void showReminder() {
  tcaSelect(3);
  display.clearDisplay();

  if (reminderType == "water") {
    // Water reminder screen
    display.fillRoundRect(0, 0, 128, 16, 4, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setTextSize(1);
    display.setCursor(28, 4);
    display.print("WATER REMINDER");
    display.setTextColor(SSD1306_WHITE);

    // Water drop icon (simple)
    display.fillTriangle(64, 22, 56, 38, 72, 38, SSD1306_WHITE);
    display.fillCircle(64, 38, 8, SSD1306_WHITE);
    display.fillRect(60, 22, 8, 16, SSD1306_WHITE);

    display.setTextSize(1);
    display.setCursor(16, 50);
    display.print("Time to drink water!");
  } else {
    // Medicine reminder screen
    display.fillRoundRect(0, 0, 128, 16, 4, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setTextSize(1);
    display.setCursor(20, 4);
    display.print("MEDICINE REMINDER");
    display.setTextColor(SSD1306_WHITE);

    // Pill icon
    display.fillRoundRect(48, 22, 32, 16, 8, SSD1306_WHITE);
    display.fillRect(64, 22, 1, 16, SSD1306_BLACK);

    display.setTextSize(1);
    // Truncate message to fit OLED (21 chars per line)
    String line1 = reminderMessage.substring(0, min((int)reminderMessage.length(), 21));
    String line2 = reminderMessage.length() > 21
      ? reminderMessage.substring(21, min((int)reminderMessage.length(), 42))
      : "";
    display.setCursor(0, 42);
    display.print(line1);
    if (line2.length() > 0) {
      display.setCursor(0, 54);
      display.print(line2);
    }
  }

  display.display();
  tcaDeselect();
}

void showAlert() {
  tcaSelect(3);
  display.clearDisplay();
  display.setTextSize(1);

  display.fillRoundRect(0, 0, 128, 14, 3, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setCursor(22, 3);
  display.print("! HEALTH ALERT !");
  display.setTextColor(SSD1306_WHITE);

  int y = 18;
  if (heartRate > 120 || heartRate < 50) {
    display.setCursor(0, y); display.printf("HR: %d BPM !", heartRate); y += 10;
  }
  if (spo2 < 95 && spo2 > 0) {
    display.setCursor(0, y); display.printf("SpO2: %d%% LOW!", spo2); y += 10;
  }
  if (bodyTemperature > 38.5 || bodyTemperature < 35.0) {
    display.setCursor(0, y); display.printf("Temp: %.1fC !", bodyTemperature); y += 10;
  }
  if (gsrRaw > 800) {
    display.setCursor(0, y); display.print("HIGH STRESS!"); y += 10;
  }
  display.setCursor(10, 55);
  display.print("Check app / SMS sent");

  display.display();
  tcaDeselect();
}

void showNormal() {
  tcaSelect(3);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  switch (displayPage) {
    case 0:   // Vitals
      display.setCursor(30, 0); display.print("VITALS");
      display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
      display.setCursor(0, 13); display.print("HR:");
      display.setTextSize(2);
      display.setCursor(26, 11);
      display.print((validHeartRate && heartRate > 0) ? String(heartRate) : "--");
      display.setTextSize(1);
      display.setCursor(70, 13); display.print("BPM");

      display.setCursor(0, 36); display.print("SpO2:");
      display.setTextSize(2);
      display.setCursor(40, 34);
      display.print((validSPO2 && spo2 > 0) ? String(spo2) : "--");
      display.setTextSize(1);
      display.setCursor(80, 36); display.print("%");
      break;

    case 1:   // Temperature
      display.setCursor(22, 0); display.print("TEMPERATURE");
      display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
      display.setCursor(0, 16); display.print("Body:");
      display.setTextSize(2);
      display.setCursor(0, 28);
      display.print(bodyTemperature > 0 ? String(bodyTemperature, 1) : "--");
      display.setTextSize(1);
      display.setCursor(70, 30); display.print("C");
      display.setCursor(0, 50);
      display.printf("Ambient: %.1f C", ambientTemperature);
      break;

    case 2:   // Steps & Stress
      display.setCursor(22, 0); display.print("ACTIVITY");
      display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
      display.setCursor(0, 14); display.print("Steps:");
      display.setTextSize(2);
      display.setCursor(0, 24); display.print(stepCount);
      display.setTextSize(1);
      display.setCursor(0, 44); display.print("Stress:");
      if      (gsrRaw < 300) display.print("LOW");
      else if (gsrRaw < 600) display.print("MODERATE");
      else                   display.print("HIGH!");
      display.setCursor(0, 54);
      display.printf("GSR: %d", gsrRaw);
      break;

    case 3:   // Status
      display.setCursor(30, 0); display.print("STATUS");
      display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
      display.setCursor(0, 14);
      display.print(WiFi.status() == WL_CONNECTED ? "WiFi: OK" : "WiFi: OFFLINE");
      if (WiFi.status() == WL_CONNECTED) {
        display.setCursor(0, 26);
        display.print(WiFi.localIP().toString());
      }
      display.setCursor(0, 40);
      display.printf("Battery: %d%%", getBattery());
      display.setCursor(0, 52);
      display.printf("Steps: %ld", stepCount);
      break;
  }

  display.display();
  tcaDeselect();
}

// ─── BATTERY ─────────────────────────────────────────────────────────────────
int getBattery() {
  int raw = analogRead(BATTERY_PIN);
  float v = (raw / 4095.0) * 3.3 * 2.0;
  return constrain((int)((v - 3.0) / 1.2 * 100.0), 0, 100);
}

// ─── STEP DETECTION ──────────────────────────────────────────────────────────
void detectSteps() {
  float mag = sqrt(pow(ax/16384.0,2) + pow(ay/16384.0,2) + pow(az/16384.0,2));
  unsigned long now = millis();
  if (prevMag < STEP_THRESHOLD && mag >= STEP_THRESHOLD && (now - lastStepTime) > STEP_COOLDOWN) {
    stepCount++;
    lastStepTime = now;
  }
  prevMag = mag;
}

// ─── ANOMALY DETECTION ───────────────────────────────────────────────────────
bool detectAnomalies() {
  if (validHeartRate && heartRate > 0 && (heartRate < 50 || heartRate > 120)) return true;
  if (validSPO2 && spo2 > 0 && spo2 < 95) return true;
  if (bodyTemperature > 0 && (bodyTemperature < 35.0 || bodyTemperature > 38.5)) return true;
  if (gsrRaw > 800) return true;
  return false;
}

// ─── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== AI Health Monitor v2.0 ===");

  pinMode(VIBRATION_PIN, OUTPUT); digitalWrite(VIBRATION_PIN, LOW);
  pinMode(BATTERY_PIN, INPUT);
  analogSetAttenuation(ADC_11db);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  delay(100);

  // OLED
  tcaSelect(3);
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(15, 10); display.print("AI Health Monitor");
    display.setCursor(30, 26); display.print("Initializing...");
    display.setCursor(18, 42); display.print("v2.0 Water+Meds");
    display.display();
    Serial.println("✅ OLED");
  }
  tcaDeselect();

  // MAX30102
  tcaSelect(0);
  if (particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    particleSensor.setup();
    particleSensor.setPulseAmplitudeRed(0x3E);
    particleSensor.setPulseAmplitudeIR(0x3E);
    Serial.println("✅ MAX30102");
  } else Serial.println("⚠️  MAX30102 missing");
  tcaDeselect();

  // MLX90614
  tcaSelect(1);
  if (mlx.begin()) Serial.println("✅ MLX90614");
  else              Serial.println("⚠️  MLX90614 missing");
  tcaDeselect();

  // MPU6050
  tcaSelect(2);
  mpu.initialize();
  mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);
  mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_250);
  Serial.println(mpu.testConnection() ? "✅ MPU6050" : "⚠️  MPU6050 missing");
  tcaDeselect();

  connectWiFi();

  // Startup pulse
  digitalWrite(VIBRATION_PIN, HIGH); delay(300); digitalWrite(VIBRATION_PIN, LOW);
  Serial.println("🚀 Ready — water & medicine reminders active\n");
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // ── Read MAX30102 ────────────────────────────────────────────────────────
  tcaSelect(0);
  for (byte i = 25; i < 100; i++) {
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();
    particleSensor.nextSample();
  }
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, 100, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate);
  tcaDeselect();

  // ── Read MLX90614 ────────────────────────────────────────────────────────
  tcaSelect(1);
  float obj = mlx.readObjectTempC();
  float amb = mlx.readAmbientTempC();
  if (!isnan(obj)) bodyTemperature    = obj;
  if (!isnan(amb)) ambientTemperature = amb;
  tcaDeselect();

  // ── Read MPU6050 ─────────────────────────────────────────────────────────
  tcaSelect(2);
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
  tcaDeselect();
  detectSteps();

  // ── Read GSR ─────────────────────────────────────────────────────────────
  gsrRaw = analogRead(GSR_PIN);

  // ── Serial debug ─────────────────────────────────────────────────────────
  Serial.printf("HR:%d SpO2:%d Temp:%.1f GSR:%d Steps:%ld\n",
    heartRate, spo2, bodyTemperature, gsrRaw, stepCount);

  // ── Anomaly detection → alert screen ─────────────────────────────────────
  bool anomaly = detectAnomalies();
  if (anomaly && !alertActive) {
    alertActive  = true;
    alertStartMs = now;
    vibrateAlert();
    Serial.println("⚠️  ANOMALY DETECTED");
  }
  if (alertActive && (now - alertStartMs > 12000)) alertActive = false;

  // ── Reminder auto-clear after REMINDER_SHOW_MS ───────────────────────────
  if (reminderActive && (now - reminderStartMs > REMINDER_SHOW_MS)) {
    reminderActive = false;
    reminderMessage = "";
  }

  // ── OLED priority: reminder > alert > normal pages ───────────────────────
  if (reminderActive)       showReminder();
  else if (alertActive)     showAlert();
  else {
    if (now - lastPageMs > PAGE_INTERVAL) {
      displayPage = (displayPage + 1) % 4;
      lastPageMs  = now;
    }
    showNormal();
  }

  // ── Send sensor data to server ────────────────────────────────────────────
  if (now - lastSendMs > SEND_INTERVAL) {
    sendSensorData();
    lastSendMs = now;
  }

  // ── Poll reminder queue from server ──────────────────────────────────────
  if (now - lastPollMs > POLL_INTERVAL) {
    pollReminders();
    lastPollMs = now;
  }

  delay(40);
}
