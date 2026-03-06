#include <Wire.h>
#include "ICM_20948.h" // SparkFun ICM_20948 IMU Library
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- BLE Configuration ---
BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Standard UUIDs for the Nordic UART Service
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E" 
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { 
      deviceConnected = true; 
    }
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
    }
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

// --- IMU Configuration ---
#define SERIAL_PORT Serial
#define WIRE_PORT Wire
#define AD0_VAL 1 // 1 is default for SparkFun breakout, 0 if ADR jumper is closed

ICM_20948_I2C myICM;

// Smoothing Configuration
const int WINDOW_SIZE = 10; 
float ax_buf[WINDOW_SIZE] = {0}, ay_buf[WINDOW_SIZE] = {0}, az_buf[WINDOW_SIZE] = {0};
float mx_buf[WINDOW_SIZE] = {0}, my_buf[WINDOW_SIZE] = {0}, mz_buf[WINDOW_SIZE] = {0};

// Running sums 
float ax_sum = 0, ay_sum = 0, az_sum = 0;
float mx_sum = 0, my_sum = 0, mz_sum = 0;
int smoothIdx = 0;

void setup() {
  SERIAL_PORT.begin(115200);
  while (!SERIAL_PORT);

  // 1. Initialize IMU
  WIRE_PORT.begin();
  WIRE_PORT.setClock(400000); 

  bool initialized = false;
  while (!initialized) {
    myICM.begin(WIRE_PORT, AD0_VAL);
    if (myICM.status != ICM_20948_Stat_Ok) {
      SERIAL_PORT.println("Sensor initialization failed. Trying again...");
      delay(500);
    } else {
      initialized = true;
      SERIAL_PORT.println("IMU Initialized.");
    }
  }

  // 2. Initialize BLE
  BLEDevice::init("ESP32_IMU");  

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
  BLEDevice::setMTU(250);

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pServer->getAdvertising()->start();
  
  SERIAL_PORT.println("Waiting for a client connection to notify...");
}

void loop() {
  // Handle BLE disconnects and reconnects
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); // give the bluetooth stack the chance to get things ready
      pServer->getAdvertising()->start(); // restart advertising
      SERIAL_PORT.println("Restarting advertising");
      oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
      // do stuff here on connecting
      oldDeviceConnected = deviceConnected;
  }

  // Read and send IMU data
  if (myICM.dataReady()) {
    myICM.getAGMT();

    // Get raw scaled readings
    float cur_ax = myICM.accX(), cur_ay = myICM.accY(), cur_az = myICM.accZ();
    float cur_mx = myICM.magX(), cur_my = myICM.magY(), cur_mz = myICM.magZ();

    // Update buffers and running sums
    ax_sum -= ax_buf[smoothIdx]; ax_buf[smoothIdx] = cur_ax; ax_sum += cur_ax;
    ay_sum -= ay_buf[smoothIdx]; ay_buf[smoothIdx] = cur_ay; ay_sum += cur_ay;
    az_sum -= az_buf[smoothIdx]; az_buf[smoothIdx] = cur_az; az_sum += cur_az;

    mx_sum -= mx_buf[smoothIdx]; mx_buf[smoothIdx] = cur_mx; mx_sum += cur_mx;
    my_sum -= my_buf[smoothIdx]; my_buf[smoothIdx] = cur_my; my_sum += cur_my;
    mz_sum -= mz_buf[smoothIdx]; mz_buf[smoothIdx] = cur_mz; mz_sum += cur_mz;

    smoothIdx = (smoothIdx + 1) % WINDOW_SIZE;

    // Calculate smoothed averages
    float ax = ax_sum / WINDOW_SIZE, ay = ay_sum / WINDOW_SIZE, az = az_sum / WINDOW_SIZE;
    float mx = mx_sum / WINDOW_SIZE, my = my_sum / WINDOW_SIZE, mz = mz_sum / WINDOW_SIZE;

    // Calculate Orientation
    float roll  = atan2(ay, az) * 180.0 / PI;
    float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;
    
    float rollRad  = roll * PI / 180.0;
    float pitchRad = pitch * PI / 180.0;

    // Tilt-compensated magnetometer
    float mx_comp = mx * cos(pitchRad) + mz * sin(pitchRad);
    float my_comp = mx * sin(rollRad) * sin(pitchRad) + my * cos(rollRad) - mz * sin(rollRad) * cos(pitchRad);

    float yaw = atan2(-my_comp, mx_comp) * 180.0 / PI;
    if (yaw < 0) yaw += 360.0;

    // --- Send Data via BLE ---
    if (deviceConnected) {
      // Create a character array to hold the formatted string
      char txString[100]; 
      
      // Format the string as "Roll,Pitch,Yaw,ax,ay,az"
      snprintf(txString, sizeof(txString), "%.2f,%.2f,%.2f,%.2f,%.2f,%.2f", roll, pitch, yaw, ax, ay, az);

      // Set the value to the TX characteristic and notify the app
      pTxCharacteristic->setValue((uint8_t*)txString, strlen(txString));
      pTxCharacteristic->notify();

      // Print to Serial monitor for debugging
      SERIAL_PORT.println(txString);
    }

    delay(30); 
  }
}