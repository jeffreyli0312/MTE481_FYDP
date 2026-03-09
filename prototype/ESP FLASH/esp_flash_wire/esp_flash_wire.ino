#include <Wire.h>
#include "ICM_20948.h" 

// --- IMU Configuration ---
#define WIRE_PORT Wire
#define AD0_VAL 1 
ICM_20948_I2C myICM;

const int IMU_WINDOW = 10; 
float ax_buf[IMU_WINDOW] = {0}, ay_buf[IMU_WINDOW] = {0}, az_buf[IMU_WINDOW] = {0};
float mx_buf[IMU_WINDOW] = {0}, my_buf[IMU_WINDOW] = {0}, mz_buf[IMU_WINDOW] = {0};
float ax_sum = 0, ay_sum = 0, az_sum = 0;
float mx_sum = 0, my_sum = 0, mz_sum = 0;
int imuIdx = 0;

// Global IMU variables to hold the latest readings
float latest_roll = 0, latest_pitch = 0, latest_yaw = 0;
float latest_ax = 0, latest_ay = 0, latest_az = 0;

// --- EMG Configuration ---
const int emgPin = 34;          
const int EMG_WINDOW = 20;      
const int BASELINE_WINDOW = 100;

float rawBuffer[BASELINE_WINDOW] = {0};
float smoothBuffer[EMG_WINDOW] = {0};
int rawIdx = 0, smoothIdx = 0;
float rawSum = 0, smoothSum = 0;

// Timing
unsigned long lastTransmission = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial);

  // 1. Initialize IMU
  WIRE_PORT.begin();
  WIRE_PORT.setClock(400000); 
  bool initialized = false;
  while (!initialized) {
    myICM.begin(WIRE_PORT, AD0_VAL);
    if (myICM.status != ICM_20948_Stat_Ok) {
      Serial.println("IMU init failed. Check wiring. Trying again...");
      delay(500);
    } else {
      initialized = true;
    }
  }

  // 2. Initialize EMG Baseline
  float initialRead = (analogRead(emgPin) / 4095.0) * 3.3;
  for (int i = 0; i < BASELINE_WINDOW; i++) {
    rawBuffer[i] = initialRead;
    rawSum += initialRead;
  }
}

void loop() {
  // --- 1. Fast EMG Processing (~100Hz loop) ---
  float v_raw = (analogRead(emgPin) / 4095.0) * 3.3;
  
  rawSum -= rawBuffer[rawIdx];            
  rawBuffer[rawIdx] = v_raw;              
  rawSum += rawBuffer[rawIdx];
  rawIdx = (rawIdx + 1) % BASELINE_WINDOW;
  float baseline = rawSum / BASELINE_WINDOW;

  float v_ac = v_raw - baseline;
  float v_rect = abs(v_ac);

  smoothSum -= smoothBuffer[smoothIdx];
  smoothBuffer[smoothIdx] = v_rect;
  smoothSum += smoothBuffer[smoothIdx];
  smoothIdx = (smoothIdx + 1) % EMG_WINDOW;
  float v_env = smoothSum / EMG_WINDOW;

  // --- 2. Update IMU ONLY if fresh data is ready ---
  if (myICM.dataReady()) {
    myICM.getAGMT();
    float cur_ax = myICM.accX(), cur_ay = myICM.accY(), cur_az = myICM.accZ();
    float cur_mx = myICM.magX(), cur_my = myICM.magY(), cur_mz = myICM.magZ();

    ax_sum -= ax_buf[imuIdx]; ax_buf[imuIdx] = cur_ax; ax_sum += cur_ax;
    ay_sum -= ay_buf[imuIdx]; ay_buf[imuIdx] = cur_ay; ay_sum += cur_ay;
    az_sum -= az_buf[imuIdx]; az_buf[imuIdx] = cur_az; az_sum += cur_az;
    mx_sum -= mx_buf[imuIdx]; mx_buf[imuIdx] = cur_mx; mx_sum += cur_mx;
    my_sum -= my_buf[imuIdx]; my_buf[imuIdx] = cur_my; my_sum += cur_my;
    mz_sum -= mz_buf[imuIdx]; mz_buf[imuIdx] = cur_mz; mz_sum += cur_mz;

    imuIdx = (imuIdx + 1) % IMU_WINDOW;

    latest_ax = ax_sum / IMU_WINDOW; latest_ay = ay_sum / IMU_WINDOW; latest_az = az_sum / IMU_WINDOW;
    float mx = mx_sum / IMU_WINDOW, my = my_sum / IMU_WINDOW, mz = mz_sum / IMU_WINDOW;

    latest_roll  = atan2(latest_ay, latest_az) * 180.0 / PI;
    latest_pitch = atan2(-latest_ax, sqrt(latest_ay * latest_ay + latest_az * latest_az)) * 180.0 / PI;
    
    float rollRad  = latest_roll * PI / 180.0;
    float pitchRad = latest_pitch * PI / 180.0;

    float mx_comp = mx * cos(pitchRad) + mz * sin(pitchRad);
    float my_comp = mx * sin(rollRad) * sin(pitchRad) + my * cos(rollRad) - mz * sin(rollRad) * cos(pitchRad);

    latest_yaw = atan2(-my_comp, mx_comp) * 180.0 / PI;
    if (latest_yaw < 0) latest_yaw += 360.0;
  }

  // --- 3. Transmit Data via Wired Serial ---
  if (millis() - lastTransmission >= 10) {
    lastTransmission = millis();
    
    // Format: Roll,Pitch,Yaw,ax,ay,az,EMG_Raw,EMG_Env
    Serial.printf("%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,%.3f,%.3f\n", 
             latest_roll, latest_pitch, latest_yaw, latest_ax, latest_ay, latest_az, v_raw, v_env);
  }
  delay(50);

}