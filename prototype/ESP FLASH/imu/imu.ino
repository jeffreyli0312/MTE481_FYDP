#include <Wire.h>
#include "ICM_20948.h" // SparkFun ICM_20948 IMU Library

#define SERIAL_PORT Serial
#define WIRE_PORT Wire
#define AD0_VAL 1 // 1 is default for SparkFun breakout, 0 if ADR jumper is closed

ICM_20948_I2C myICM;

// --- Smoothing Configuration ---
const int WINDOW_SIZE = 10; 

// Circular buffers (Mag is kept internally to calculate Yaw)
float ax_buf[WINDOW_SIZE] = {0}, ay_buf[WINDOW_SIZE] = {0}, az_buf[WINDOW_SIZE] = {0};
float mx_buf[WINDOW_SIZE] = {0}, my_buf[WINDOW_SIZE] = {0}, mz_buf[WINDOW_SIZE] = {0};

// Running sums 
float ax_sum = 0, ay_sum = 0, az_sum = 0;
float mx_sum = 0, my_sum = 0, mz_sum = 0;
int smoothIdx = 0;

void setup() {
  SERIAL_PORT.begin(115200);
  while (!SERIAL_PORT);

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
    }
  }
}

void loop() {
  if (myICM.dataReady()) {
    myICM.getAGMT();

    // 1. Get raw scaled readings
    float cur_ax = myICM.accX(), cur_ay = myICM.accY(), cur_az = myICM.accZ();
    float cur_mx = myICM.magX(), cur_my = myICM.magY(), cur_mz = myICM.magZ();

    // 2. Update buffers and running sums
    ax_sum -= ax_buf[smoothIdx]; ax_buf[smoothIdx] = cur_ax; ax_sum += cur_ax;
    ay_sum -= ay_buf[smoothIdx]; ay_buf[smoothIdx] = cur_ay; ay_sum += cur_ay;
    az_sum -= az_buf[smoothIdx]; az_buf[smoothIdx] = cur_az; az_sum += cur_az;

    mx_sum -= mx_buf[smoothIdx]; mx_buf[smoothIdx] = cur_mx; mx_sum += cur_mx;
    my_sum -= my_buf[smoothIdx]; my_buf[smoothIdx] = cur_my; my_sum += cur_my;
    mz_sum -= mz_buf[smoothIdx]; mz_buf[smoothIdx] = cur_mz; mz_sum += cur_mz;

    smoothIdx = (smoothIdx + 1) % WINDOW_SIZE;

    // 3. Calculate smoothed averages
    float ax = ax_sum / WINDOW_SIZE, ay = ay_sum / WINDOW_SIZE, az = az_sum / WINDOW_SIZE;
    float mx = mx_sum / WINDOW_SIZE, my = my_sum / WINDOW_SIZE, mz = mz_sum / WINDOW_SIZE;

    // 4. Calculate Orientation
    float roll  = atan2(ay, az) * 180.0 / PI;
    float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;

    float rollRad  = roll * PI / 180.0;
    float pitchRad = pitch * PI / 180.0;

    // Tilt-compensated magnetometer (Required for Yaw)
    float mx_comp = mx * cos(pitchRad) + mz * sin(pitchRad);
    float my_comp = mx * sin(rollRad) * sin(pitchRad) + my * cos(rollRad) - mz * sin(rollRad) * cos(pitchRad);

    float yaw = atan2(-my_comp, mx_comp) * 180.0 / PI;
    if (yaw < 0) yaw += 360.0;

    // 5. Output 6 variables
    // Format: Roll,Pitch,Yaw,ax,ay,az
    SERIAL_PORT.print(roll); SERIAL_PORT.print(",");
    SERIAL_PORT.print(pitch); SERIAL_PORT.print(",");
    SERIAL_PORT.print(yaw); SERIAL_PORT.print(",");
    SERIAL_PORT.print(ax); SERIAL_PORT.print(",");
    SERIAL_PORT.print(ay); SERIAL_PORT.print(",");
    SERIAL_PORT.println(az);

    delay(30); 
  }
}