#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- BLE Configuration ---
BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;
bool oldDeviceConnected = false;

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E" 
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; }
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; }
};

// --- EMG Configuration ---
const int sensorPin = 34;          // Matches 'D34' on ESP32
const int windowSize = 20;         // Number of samples for smoothing
const int rawBufferSize = 100;     // Number of samples for DC baseline

// Arrays for circular buffers
float rawBuffer[rawBufferSize] = {0};
float smoothBuffer[windowSize] = {0};

// Indices and running sums for efficient averaging
int rawIndex = 0;
int smoothIndex = 0;
float rawSum = 0;
float smoothSum = 0;

void setup() {
  Serial.begin(115200);

  // Pre-fill the baseline buffer to prevent a drop/spike on startup
  float initialRead = (analogRead(sensorPin) / 4095.0) * 3.3;
  for (int i = 0; i < rawBufferSize; i++) {
    rawBuffer[i] = initialRead;
    rawSum += initialRead;
  }

  // --- BLE Setup ---
  BLEDevice::init("ESP32_EMG");  

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pTxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID_TX,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
  pTxCharacteristic->addDescriptor(new BLE2902());

  pService->start();
  BLEDevice::setMTU(250);

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pServer->getAdvertising()->start();
  
  Serial.println("Waiting for a client connection...");
}

void loop() {
  // Handle BLE disconnects and reconnects
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); 
      pServer->getAdvertising()->start(); 
      Serial.println("Restarting advertising");
      oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
  }

  // --- EMG Processing ---
  float v_raw = (analogRead(sensorPin) / 4095.0) * 3.3;

  // Update Baseline Buffer 
  rawSum -= rawBuffer[rawIndex];            
  rawBuffer[rawIndex] = v_raw;              
  rawSum += rawBuffer[rawIndex];
  rawIndex = (rawIndex + 1) % rawBufferSize;
  
  float baseline = rawSum / rawBufferSize;

  // Remove DC Offset & Rectify
  float v_ac = v_raw - baseline;
  float v_rect = abs(v_ac);

  // Smooth (Moving Average)
  smoothSum -= smoothBuffer[smoothIndex];
  smoothBuffer[smoothIndex] = v_rect;
  smoothSum += smoothBuffer[smoothIndex];
  smoothIndex = (smoothIndex + 1) % windowSize;
  
  float v_envelope = smoothSum / windowSize;

  // --- Transmit Data via BLE ---
  if (deviceConnected) {
    char txString[50]; 
    
    // Format the string as "v_raw,v_envelope"
    snprintf(txString, sizeof(txString), "%.3f,%.3f", v_raw, v_envelope);

    pTxCharacteristic->setValue((uint8_t*)txString, strlen(txString));
    pTxCharacteristic->notify();

    // Print to Serial monitor for debugging
    Serial.println(txString);
  }

  delay(10); // Maintain ~100Hz sampling rate
}