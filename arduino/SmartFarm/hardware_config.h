#pragma once
#include <Arduino.h>
// NodeMCU ESP-32S: Pxx labels correspond to GPIOxx.
constexpr uint8_t DHT_PIN = 4, WATER_SDA = 21, WATER_SCL = 22;
constexpr uint8_t SOIL_PIN = 34; // ADC1 supports sampling while Wi-Fi is active.
constexpr uint8_t LIGHT_INPUT = 35; // ADC1: 3V3 -> LDR -> GPIO35 -> 10k ohm -> GND.
constexpr uint8_t PUMP_PIN = 25, FAN_PIN = 26, LED_PIN = 13;
// Motors are not selected yet. Configure the driver before enabling this.
// false leaves motor pins INPUT; sensing and ordinary LED remain available.
constexpr bool PUMP_DRIVER_CONFIGURED = false;
constexpr bool FAN_DRIVER_CONFIGURED = true;
constexpr bool PUMP_ACTIVE_HIGH = true, FAN_ACTIVE_HIGH = false;
constexpr uint8_t WATER_LOW_ADDRESS = 0x77, WATER_HIGH_ADDRESS = 0x78;
constexpr uint8_t WATER_TOUCH_THRESHOLD = 100;
constexpr uint32_t MANUAL_LEASE_MS = 10000;



