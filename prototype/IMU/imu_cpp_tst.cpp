#include "ICM_20948.h"
#include <MadgwickAHRS.h>

#define SERIAL_PORT Serial
#define WIRE_PORT Wire
#define AD0_VAL 1

ICM_20948_I2C myICM;

// Gyro-only yaw variables
float yaw_gyro = 0;
unsigned long last_t = 0;

void setup() {
  SERIAL_PORT.begin(115200);
  while (!SERIAL_PORT);

  WIRE_PORT.begin();
  WIRE_PORT.setClock(400000);

  bool ok = false;
  while (!ok) {
    myICM.begin(WIRE_PORT, AD0_VAL);
    if (myICM.status == ICM_20948_Stat_Ok) ok = true;
    else {
      SERIAL_PORT.println("IMU init failed... retrying");
      delay(500);
    }
  }

  // Initialize timestamp
  last_t = micros();
}

void loop() {

  if (myICM.dataReady()) {
    myICM.getAGMT();

    // Read gyro Z rate (deg/s)
    float gz_deg = myICM.gyrZ();           // degrees/second

    // Compute dt (seconds)
    unsigned long now = micros();
    float dt = (now - last_t) * 1e-6;      // convert µs → s
    last_t = now;

    // Integrate gyro to get yaw
    yaw_gyro += gz_deg * dt;

    // Wrap yaw within 0–360 degrees
    if (yaw_gyro >= 360.0f) yaw_gyro -= 360.0f;
    if (yaw_gyro <   0.0f) yaw_gyro += 360.0f;

    // Output to Python as roll,pitch,yaw
    // Roll = 0, Pitch = 0 (ignored)
    SERIAL_PORT.print(0.0); SERIAL_PORT.print(",");
    SERIAL_PORT.print(0.0); SERIAL_PORT.print(",");
    SERIAL_PORT.println(yaw_gyro);

    delay(5);
  }
}
