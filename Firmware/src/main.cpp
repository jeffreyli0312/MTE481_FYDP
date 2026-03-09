/**
 * main.cpp  (PlatformIO entry point)
 *
 * Collects synchronized EMG + IMU data and sends a 36-byte packed binary
 * WorkoutDataPacket_t over BLE (Nordic UART Service) at ~100 Hz.
 *
 * File layout:
 *   src/main.cpp          ← this file  (BLE setup + main loop)
 *   include/data_packet.h ← struct / union definition (36-byte layout)
 *   include/sensor_collect.h ← EMG + IMU read functions
 *
 * Required Libraries (platformio.ini lib_deps):
 *   - sparkfun/SparkFun ICM 20948 IMU Arduino Library
 *   - ESP32 BLE Arduino (bundled with espressif32 platform)
 *
 * Hardware:
 *   - ESP32 dev board
 *   - SparkFun ICM-20948 breakout ×2 on I2C
 *       Left  IMU → AD0 pin HIGH  (address 0x69, AD0_VAL = 1)
 *       Right IMU → AD0 pin LOW   (address 0x68, AD0_VAL = 0)
 *   - EMG sensors on ADC pins 34 (L_Tri), 35 (L_Pec), 32 (R_Tri), 33 (R_Pec)
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "data_packet.h"
#include "sensor_collect.h"

// =================================================================================
// BLE Configuration  (Nordic UART Service UUIDs — same as IMU_BLE / EMG_BLE)
// =================================================================================
#define DEVICE_NAME            "ESP32_WORKOUT"
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// =================================================================================
// Sampling rate
// =================================================================================
#define SAMPLE_INTERVAL_MS  10   // 10 ms → 100 Hz

// =================================================================================
// Globals
// =================================================================================
BLEServer          *pServer           = NULL;
BLECharacteristic  *pTxCharacteristic = NULL;
bool  deviceConnected    = false;
bool  oldDeviceConnected = false;

// The global packet buffer — mirrors tx_buffer in data_compile.c
PacketBuffer_u tx_buffer;

// =================================================================================
// BLE Callbacks
// =================================================================================
class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer)    { deviceConnected = true;  }
    void onDisconnect(BLEServer *pServer) { deviceConnected = false; }
};

class MyRxCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String rxValue = pCharacteristic->getValue().c_str();
        if (rxValue.length() > 0) {
            Serial.print("RX: ");
            Serial.println(rxValue);
        }
    }
};

// =================================================================================
// setup()
// =================================================================================
void setup() {
    Serial.begin(115200);
    Serial.println("=== COMBINED_BLE startup ===");

    // 1. Initialize sensors (EMG pin prefill + IMUs over I2C)
    Sensors_Init();

    // 2. Initialize BLE
    BLEDevice::init(DEVICE_NAME);

    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    BLEService *pService = pServer->createService(SERVICE_UUID);

    // TX characteristic: device → phone (notify)
    pTxCharacteristic = pService->createCharacteristic(
                            CHARACTERISTIC_UUID_TX,
                            BLECharacteristic::PROPERTY_NOTIFY
                        );
    pTxCharacteristic->addDescriptor(new BLE2902());

    // RX characteristic: phone → device (write) — optional control channel
    BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
                                               CHARACTERISTIC_UUID_RX,
                                               BLECharacteristic::PROPERTY_WRITE
                                           );
    pRxCharacteristic->setCallbacks(new MyRxCallbacks());

    pService->start();

    // Increase MTU so the 36-byte packet fits comfortably
    BLEDevice::setMTU(250);

    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pServer->getAdvertising()->start();

    Serial.println("BLE advertising started. Waiting for connection...");
}

// =================================================================================
// loop()
// =================================================================================
void loop() {

    // --- Handle BLE reconnection ---
    if (!deviceConnected && oldDeviceConnected) {
        delay(500);
        pServer->getAdvertising()->start();
        Serial.println("Disconnected – restarting advertising.");
        oldDeviceConnected = deviceConnected;
    }
    if (deviceConnected && !oldDeviceConnected) {
        Serial.println("Client connected.");
        oldDeviceConnected = deviceConnected;
    }

    // --- Collect all sensor data into the packet buffer ---
    Sensors_Collect(tx_buffer);

    // --- Send the 36-byte binary packet via BLE notify ---
    if (deviceConnected) {
        pTxCharacteristic->setValue(tx_buffer.raw_bytes, sizeof(WorkoutDataPacket_t));
        pTxCharacteristic->notify();

        // Debug print — orientation fields divided by 100 to show degrees
        Serial.printf("[ts=%lu] EMG: %d %d %d %d\n",
            (unsigned long)tx_buffer.packet.timestamp_ms,
            tx_buffer.packet.left_tricep,  tx_buffer.packet.left_pec,
            tx_buffer.packet.right_tricep, tx_buffer.packet.right_pec
        );
        Serial.printf("  L-IMU acc: %d %d %d  R/P/Y: %.2f %.2f %.2f\n",
            tx_buffer.packet.left_acc_x, tx_buffer.packet.left_acc_y, tx_buffer.packet.left_acc_z,
            tx_buffer.packet.left_roll  / 100.0f,
            tx_buffer.packet.left_pitch / 100.0f,
            tx_buffer.packet.left_yaw   / 100.0f
        );
        Serial.printf("  R-IMU acc: %d %d %d  R/P/Y: %.2f %.2f %.2f\n",
            tx_buffer.packet.right_acc_x, tx_buffer.packet.right_acc_y, tx_buffer.packet.right_acc_z,
            tx_buffer.packet.right_roll  / 100.0f,
            tx_buffer.packet.right_pitch / 100.0f,
            tx_buffer.packet.right_yaw   / 100.0f
        );
    }

    delay(SAMPLE_INTERVAL_MS);
}
