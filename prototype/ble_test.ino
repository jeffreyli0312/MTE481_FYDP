#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;

// Standard UUIDs for the Nordic UART Service
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E" 
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; };
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue();
      if (rxValue.length() > 0) {
        Serial.print("Received Value: ");
        for (int i = 0; i < rxValue.length(); i++) Serial.print(rxValue[i]);
        Serial.println();
      }
    }
};

void setup() {
  Serial.begin(115200);
  BLEDevice::init("ESP32_EMG_BLE");

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pTxCharacteristic = pService->createCharacteristic(
                        CHARACTERISTIC_UUID_TX,
                        BLECharacteristic::PROPERTY_NOTIFY
                      );
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
                                           CHARACTERISTIC_UUID_RX,
                                           BLECharacteristic::PROPERTY_WRITE
                                         );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();
  // Set the MTU to the maximum possible (517)
  BLEDevice::setMTU(250);
  pServer->getAdvertising()->start();
  Serial.println("Waiting for a client connection to notify...");
}

void loop() {
    if (deviceConnected) {
        // 1. Define an array of 214 bytes
        uint8_t manualData[214];

        // 2. Fill it with data (e.g., 0, 1, 2, 3... 213)
        for (int i = 0; i < 214; i++) {
            manualData[i] = (uint8_t)i;
        }
        
        // 3. Set the value and notify
        // The first argument is the array, the second is the size (214)
        pTxCharacteristic->setValue(manualData, 214);
        pTxCharacteristic->notify();
        
        Serial.println("Sent 214-byte sequence");
        delay(1000); 
    }
}