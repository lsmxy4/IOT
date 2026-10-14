#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "hardware_config.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

struct Settings {
  float soilStart = 40, soilStop = 55, fanTemperature = 28, fanHumidity = 10, lightThreshold = 2;
  uint16_t pumpMaxSeconds = 10, pumpCooldownSeconds = 60;
  float waterMin = 20;
  uint16_t soilDry = 800, soilWet = 300;
  bool soilCalibrated = false;
} settings;
DHT dht(DHT_PIN, DHT11);
WebServer server(80);
bool automatic = true, armed = false, pump = false, fan = false, light = false;
bool dhtOk = false, soilOk = false, lightOk = false, waterSensorOk = false, waterOk = false;
bool dark = false, pumpLocked = false, cooldownActive = false, fsOk = false;
float temperature = NAN, humidity = NAN, soil = NAN, waterLevel = NAN;
uint16_t soilRaw = 0, lightRaw = 0;
float lightPercent = 0;
uint32_t pumpStarted = 0, pumpStopped = 0, lastSensors = 0, lastDht = 0, lastClient = 0, lastWaterValid = 0;
uint8_t waterGoodSamples = 0;

bool validSettings(JsonDocument &doc) {
  for (const char *key : {"soilStart", "soilStop", "fanTemperature", "fanHumidity", "lightThreshold", "waterMin"})
    if (!doc[key].is<float>() || !isfinite(doc[key].as<float>())) return false;
  for (const char *key : {"pumpMaxSeconds", "pumpCooldownSeconds", "soilDry", "soilWet"}) if (!doc[key].is<unsigned int>()) return false;
  if (!doc["soilCalibrated"].is<bool>()) return false;
  float start = doc["soilStart"], stop = doc["soilStop"], temp = doc["fanTemperature"], hum = doc["fanHumidity"], lux = doc["lightThreshold"], water = doc["waterMin"];
  unsigned int maxSec = doc["pumpMaxSeconds"], pause = doc["pumpCooldownSeconds"], dry = doc["soilDry"], wet = doc["soilWet"];
  return start >= 5 && stop <= 95 && stop - start >= 5 && temp >= 10 && temp <= 45 && hum >= 5 && hum <= 95
    && lux >= 0.1 && lux <= 90 && water >= 5 && water <= 80 && maxSec >= 1 && maxSec <= 30 && pause >= 10 && pause <= 3600
    && dry >= 1 && dry <= 1022 && wet >= 1 && wet <= 1022 && abs(int(dry) - int(wet)) >= 50;
}
void readSettings(JsonDocument &d) {
  settings.soilStart = d["soilStart"]; settings.soilStop = d["soilStop"];
  settings.fanTemperature = d["fanTemperature"]; settings.fanHumidity = d["fanHumidity"];
  settings.lightThreshold = d["lightThreshold"]; settings.waterMin = d["waterMin"];
  settings.pumpMaxSeconds = d["pumpMaxSeconds"]; settings.pumpCooldownSeconds = d["pumpCooldownSeconds"];
  settings.soilDry = d["soilDry"]; settings.soilWet = d["soilWet"]; settings.soilCalibrated = d["soilCalibrated"];
}
void writeSettings(JsonObject d) {
  d["soilStart"] = settings.soilStart; d["soilStop"] = settings.soilStop;
  d["fanTemperature"] = settings.fanTemperature; d["fanHumidity"] = settings.fanHumidity;
  d["lightThreshold"] = settings.lightThreshold; d["waterMin"] = settings.waterMin;
  d["pumpMaxSeconds"] = settings.pumpMaxSeconds; d["pumpCooldownSeconds"] = settings.pumpCooldownSeconds;
  d["soilDry"] = settings.soilDry; d["soilWet"] = settings.soilWet; d["soilCalibrated"] = settings.soilCalibrated;
}
uint32_t remainingCooldown() {
  if (!cooldownActive) return 0;
  uint32_t elapsed = uint32_t(millis() - pumpStopped), duration = uint32_t(settings.pumpCooldownSeconds) * 1000;
  if (elapsed >= duration) { cooldownActive = false; return 0; }
  return (duration - elapsed + 999) / 1000;
}
void writeOutputs() {
  if (PUMP_DRIVER_CONFIGURED) digitalWrite(PUMP_PIN, (pump == PUMP_ACTIVE_HIGH) ? HIGH : LOW);
  if (FAN_DRIVER_CONFIGURED) digitalWrite(FAN_PIN, (fan == FAN_ACTIVE_HIGH) ? HIGH : LOW);
  digitalWrite(LED_PIN, light ? HIGH : LOW); // GPIO -> 330 ohms -> LED anode -> cathode -> GND.
}
void setPump(bool next) {
  if (next && !pump) pumpStarted = millis();
  if (!next && pump) { pumpStopped = millis(); cooldownActive = true; }
  pump = next;
}
void stopAll() { armed = false; setPump(false); fan = light = false; writeOutputs(); }
void control() {
  uint32_t now = millis();
  if (!automatic && (armed || light) && uint32_t(now - lastClient) >= MANUAL_LEASE_MS) { stopAll(); return; }
  if (pump && uint32_t(now - pumpStarted) >= uint32_t(settings.pumpMaxSeconds) * 1000) pumpLocked = true;
  if (waterSensorOk && uint32_t(now - lastWaterValid) > 2500) { waterSensorOk = false; waterOk = false; }
  bool wantPump = pump, wantFan = fan, wantLight = light;
  if (automatic) {
    wantPump = soilOk && (soil < settings.soilStart || (pump && soil < settings.soilStop));
    wantFan = dhtOk && (temperature >= settings.fanTemperature || humidity >= settings.fanHumidity || (fan && (temperature > settings.fanTemperature - 1 || humidity > settings.fanHumidity - 3)));
    wantLight = lightOk && (lightPercent < settings.lightThreshold || (light && lightPercent < settings.lightThreshold + 0.5));
  }
  if (!armed) { wantPump = wantFan = false; if (automatic) wantLight = false; }
  if (!PUMP_DRIVER_CONFIGURED || !soilOk || !waterSensorOk || !waterOk || pumpLocked || remainingCooldown() > 0) wantPump = false;
  if (!FAN_DRIVER_CONFIGURED || !dhtOk) wantFan = false;
  if (automatic && !lightOk) wantLight = false;
  setPump(wantPump); fan = wantFan; light = wantLight; writeOutputs();
}
bool readWaterPart(uint8_t address, uint8_t *buffer, uint8_t count) {
  // Bounded read: never wait indefinitely for an unplugged sensor.
  uint8_t received = Wire.requestFrom(address, count);
  if (received != count) { while (Wire.available()) Wire.read(); return false; }
  for (uint8_t i = 0; i < count; ++i) buffer[i] = Wire.read();
  return true;
}
void readWater() {
  uint8_t lower[8], upper[12];
  bool ok = readWaterPart(WATER_LOW_ADDRESS, lower, 8) && readWaterPart(WATER_HIGH_ADDRESS, upper, 12);
  if (!ok) { waterSensorOk = waterOk = false; waterLevel = NAN; waterGoodSamples = 0; return; }
  uint8_t pads = 0;
  for (uint8_t i = 0; i < 20; ++i) { uint8_t sample = i < 8 ? lower[i] : upper[i - 8]; if (sample <= WATER_TOUCH_THRESHOLD) break; ++pads; }
  bool allFF = true; for (uint8_t v : lower) if (v != 0xFF) allFF = false; for (uint8_t v : upper) if (v != 0xFF) allFF = false;
  if (allFF) { waterSensorOk = waterOk = false; waterLevel = NAN; waterGoodSamples = 0; return; }
  waterLevel = pads * 5.0f; waterSensorOk = true; lastWaterValid = millis();
  if (waterLevel < settings.waterMin) { waterOk = false; waterGoodSamples = 0; }
  else if (++waterGoodSamples >= 3) { waterOk = true; waterGoodSamples = 3; }
}
void readSoil() {
  soilRaw = analogRead(SOIL_PIN);
  soilOk = settings.soilCalibrated && soilRaw > 1 && soilRaw < 1022;
  soil = soilOk ? constrain((float(soilRaw) - settings.soilDry) * 100.0f / (int(settings.soilWet) - int(settings.soilDry)), 0.0f, 100.0f) : NAN;
}
void readLight() {
  uint32_t total = 0;
  for (uint8_t i = 0; i < 8; ++i) total += analogRead(LIGHT_INPUT);
  lightRaw = total / 8;
  lightPercent = lightRaw * 100.0f / 1023.0f;
  // Rail values can be real darkness/brightness; analog readings cannot prove wiring integrity.
  lightOk = true;
  dark = lightPercent < settings.lightThreshold;
}

void cors() { server.sendHeader("Access-Control-Allow-Origin", "*"); server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); server.sendHeader("Access-Control-Allow-Headers", "Content-Type"); server.sendHeader("Cache-Control", "no-store"); }
void error(int code, const char *text) { JsonDocument d; d["error"] = text; String json; serializeJson(d, json); cors(); server.send(code, "application/json", json); }
bool body(JsonDocument &d) { if (server.arg("plain").length() > 1024 || deserializeJson(d, server.arg("plain")) || !d.is<JsonObject>()) { error(400, "Invalid JSON"); return false; } return true; }
void status() {
  JsonDocument d; d["schema"] = "smartfarm-v1";
  d["temperature"] = nullptr; d["humidity"] = nullptr; d["soil"] = nullptr; d["light"] = nullptr; d["waterLevel"] = nullptr; d["dark"] = nullptr;
  if (dhtOk) { d["temperature"] = temperature; d["humidity"] = humidity; }
  if (soilOk) d["soil"] = soil;
  if (waterSensorOk) d["waterLevel"] = waterLevel;
  if (lightOk) { d["dark"] = lightPercent < settings.lightThreshold; d["light"] = lightPercent; }
  d["waterOk"] = waterOk; d["auto"] = automatic; d["armed"] = armed; d["hardwareReady"] = PUMP_DRIVER_CONFIGURED && FAN_DRIVER_CONFIGURED; d["pumpReady"] = PUMP_DRIVER_CONFIGURED; d["fanReady"] = FAN_DRIVER_CONFIGURED; d["pumpLocked"] = pumpLocked;
  d["pumpSeconds"] = pump ? uint32_t(millis() - pumpStarted) / 1000 : 0; d["cooldownSeconds"] = remainingCooldown(); d["uptime"] = millis() / 1000;
  JsonObject o = d["outputs"].to<JsonObject>(); o["pump"] = pump; o["fan"] = fan; o["light"] = light;
  JsonObject sensors = d["sensors"].to<JsonObject>(); sensors["dht"] = dhtOk; sensors["soil"] = soilOk; sensors["light"] = lightOk; sensors["water"] = waterSensorOk;
  JsonObject c = d["capabilities"].to<JsonObject>(); c["soil"] = true; c["lightAnalog"] = true; c["waterAnalog"] = true;
  JsonObject raw = d["raw"].to<JsonObject>(); raw["soil"] = soilRaw; raw["light"] = lightRaw; raw["water"] = nullptr;
  writeSettings(d["settings"].to<JsonObject>());
  String json; serializeJson(d, json); cors(); server.send(200, "application/json", json);
}
void setupApi() {
  server.on("/api/status", HTTP_GET, []() { lastClient = millis(); control(); status(); });
  server.on("/api/stop", HTTP_POST, []() { stopAll(); status(); });
  server.on("/api/arm", HTTP_POST, []() { JsonDocument d; if (!body(d)) return; if (!d["armed"].is<bool>()) { error(400, "armed must be boolean"); return; } lastClient = millis(); armed = d["armed"]; control(); status(); });
  server.on("/api/mode", HTTP_POST, []() { JsonDocument d; if (!body(d)) return; if (!d["auto"].is<bool>()) { error(400, "auto must be boolean"); return; } setPump(false); fan = light = false; automatic = d["auto"]; lastClient = millis(); control(); status(); });
  server.on("/api/pump/reset", HTTP_POST, []() { if (armed || !waterSensorOk || !waterOk || !soilOk) { error(409, "Stop outputs and check water/soil before reset"); return; } pumpLocked = false; status(); });
  server.on("/api/settings", HTTP_POST, []() {
    JsonDocument d; if (!body(d)) return; if (!validSettings(d)) { error(400, "Invalid settings or calibration"); return; }
    if (!fsOk) { error(500, "Storage unavailable"); return; }
    File f = LittleFS.open("/farm.tmp", "w"); if (!f) { error(500, "Storage unavailable"); return; }
    size_t expected = measureJson(d); size_t written = serializeJson(d, f); f.close();
    if (written != expected || !LittleFS.rename("/farm.tmp", "/farm.json")) { error(500, "Save failed"); return; }
    readSettings(d); readSoil(); if (!waterSensorOk || waterLevel < settings.waterMin) { waterOk = false; waterGoodSamples = 0; }
    control(); status();
  });
  server.on("/api/outputs", HTTP_POST, []() {
    if (automatic) { error(409, "Select manual mode"); return; }
    JsonDocument d; if (!body(d)) return;
    if (d.size() != 1) { error(400, "Send one output per request"); return; }
    String key; for (JsonPair p : d.as<JsonObject>()) { key = p.key().c_str(); if (!p.value().is<bool>()) { error(400, "Output must be boolean"); return; } }
    if (key != "pump" && key != "fan" && key != "light") { error(400, "Unknown output"); return; }
    bool on = d[key]; control();
    if (!armed && key != "light") { error(409, "Enable motor outputs first"); return; }
    if (on && ((key == "pump" && !PUMP_DRIVER_CONFIGURED) || (key == "fan" && !FAN_DRIVER_CONFIGURED))) { error(409, "Motor driver is not configured"); return; }
    if (on && key == "pump" && (!waterOk || !waterSensorOk || !soilOk || pumpLocked || remainingCooldown())) { error(409, "Pump blocked by water, soil, timeout or cooldown"); return; }
    if (on && key == "fan" && !dhtOk) { error(409, "DHT sensor unavailable"); return; }
    // A repeated ON request must not reset the maximum-run timer.
    if (key == "pump") setPump(on); else if (key == "fan") fan = on; else light = on;
    lastClient = millis(); control(); status();
  });
  server.onNotFound([]() { if (server.method() == HTTP_OPTIONS) { cors(); server.send(204); } else error(404, "Unknown smartfarm API"); });
  server.begin();
}
void setup() {
  Serial.begin(115200);
  digitalWrite(LED_PIN, LOW); pinMode(LED_PIN, OUTPUT);
  if (PUMP_DRIVER_CONFIGURED) { digitalWrite(PUMP_PIN, PUMP_ACTIVE_HIGH ? LOW : HIGH); pinMode(PUMP_PIN, OUTPUT); }
  else pinMode(PUMP_PIN, INPUT);
  if (FAN_DRIVER_CONFIGURED) { digitalWrite(FAN_PIN, FAN_ACTIVE_HIGH ? LOW : HIGH); pinMode(FAN_PIN, OUTPUT); }
  else pinMode(FAN_PIN, INPUT);
  pinMode(LIGHT_INPUT, INPUT);
  analogReadResolution(10); // Keep the web calibration scale at 0..1023.
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(LIGHT_INPUT, ADC_11db);
  stopAll(); dht.begin(); Wire.begin(WATER_SDA, WATER_SCL); Wire.setClock(100000); Wire.setTimeOut(50);
  fsOk = LittleFS.begin(true);
  if (fsOk) { File f = LittleFS.open("/farm.json", "r"); if (f) { JsonDocument d; if (!deserializeJson(d, f) && validSettings(d)) readSettings(d); f.close(); } }
  WiFi.mode(WIFI_STA); WiFi.setHostname("smartfarm"); WiFi.begin(WIFI_SSID, WIFI_PASSWORD); WiFi.setAutoReconnect(true); setupApi();
  Serial.println("Smartfarm: outputs DISARMED. Check hardware_config.h before connecting motors.");
}
void loop() {
  control(); server.handleClient();
  if (uint32_t(millis() - lastSensors) >= 400) { lastSensors = millis(); readWater(); readSoil(); readLight(); }
  if (uint32_t(millis() - lastDht) >= 2500) { lastDht = millis(); temperature = dht.readTemperature(); humidity = dht.readHumidity(); dhtOk = isfinite(temperature) && isfinite(humidity); }
  control();
  static bool mdns = false, announced = false; static uint32_t attempted = 0;
  if (WiFi.status() == WL_CONNECTED) {
    if (!mdns && uint32_t(millis() - attempted) >= 3000) { attempted = millis(); mdns = MDNS.begin("smartfarm"); if (mdns) { MDNS.addService("http", "tcp", 80); Serial.println("http://smartfarm.local"); } }
    if (!announced) { Serial.print("Device IP: http://"); Serial.println(WiFi.localIP()); announced = true; }
  } else { announced = false; if (mdns) { MDNS.end(); mdns = false; } }
  yield();
}

