#include "ICM_20948.h"

//#define USE_SPI

#define SERIAL_PORT Serial
#define SPI_PORT SPI
#define CS_PIN 2

#define WIRE_PORT Wire
#define AD0_VAL 1

#ifdef USE_SPI
ICM_20948_SPI myICM;
#else
ICM_20948_I2C myICM;
#endif

void setup() {
  SERIAL_PORT.begin(115200);
  while (!SERIAL_PORT);

#ifdef USE_SPI
  SPI_PORT.begin();
#else
  WIRE_PORT.begin();
  WIRE_PORT.setClock(400000);
#endif

  bool initialized = false;

  while (!initialized) {
#ifdef USE_SPI
    myICM.begin(CS_PIN, SPI_PORT);
#else
    myICM.begin(WIRE_PORT, AD0_VAL);
#endif

    if (myICM.status == ICM_20948_Stat_Ok) {
      initialized = true;
    } else {
      SERIAL_PORT.println("IMU init failed... retrying");
      delay(500);
    }
  }

  // --- Initialize DMP ---
  if (myICM.initializeDMP() != ICM_20948_Stat_Ok) {
    SERIAL_PORT.println("DMP init failed");
    while (1);
  }

  // Enable Quaternion output (this exists in all library versions)
  myICM.enableDMPSensor(INV_ICM20948_SENSOR_ORIENTATION);

  // Enable FIFO + DMP
  myICM.enableDMP();

  SERIAL_PORT.println("ICM-20948 DMP READY");
}

void loop() {
  icm_20948_DMP_data_t dmp;

  if (myICM.readDMPdataFromFIFO(&dmp) == ICM_20948_Stat_Ok) {

    if (dmp.header & DMP_header_bitmap_Quat) {   // UNIVERSAL HEADER

      float q1 = dmp.Quat.Data.Q1;   // w
      float q2 = dmp.Quat.Data.Q2;   // x
      float q3 = dmp.Quat.Data.Q3;   // y
      float q4 = dmp.Quat.Data.Q4;   // z

      // Convert quaternion → roll, pitch, yaw
      float ysqr = q3 * q3;

      float t0 = +2.0f * (q1 * q2 + q3 * q4);
      float t1 = +1.0f - 2.0f * (q2 * q2 + ysqr);
      float roll = atan2(t0, t1) * 180.0f / PI;

      float t2 = +2.0f * (q1 * q3 - q4 * q2);
      t2 = constrain(t2, -1.0f, 1.0f);
      float pitch = asin(t2) * 180.0f / PI;

      float t3 = +2.0f * (q1 * q4 + q2 * q3);
      float t4 = +1.0f - 2.0f * (ysqr + q4 * q4);
      float yaw = atan2(t3, t4) * 180.0f / PI;
      if (yaw < 0) yaw += 360.0f;

      // Output clean CSV for Python
      SERIAL_PORT.print(roll);  SERIAL_PORT.print(",");
      SERIAL_PORT.print(pitch); SERIAL_PORT.print(",");
      SERIAL_PORT.println(yaw);
    }
  }
}
