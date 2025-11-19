#include "ICM_20948.h"
#include <MadgwickAHRS.h>

#define SERIAL_PORT Serial
#define WIRE_PORT Wire
#define AD0_VAL 1

ICM_20948_I2C myICM;
Madgwick filter;  // Madgwick filter instance

void setup() {
  SERIAL_PORT.begin(115200);
  while(!SERIAL_PORT);

  WIRE_PORT.begin();
  WIRE_PORT.setClock(400000);

  bool ok = false;
  while(!ok) {
    myICM.begin(WIRE_PORT, AD0_VAL);
    if (myICM.status == ICM_20948_Stat_Ok) ok = true;
    else {
      SERIAL_PORT.println("IMU init failed... retrying");
      delay(500);
    }
  }

  filter.begin(100);  // filter update rate ≈ 100 Hz
}

void loop() {

  if (myICM.dataReady()) {
    myICM.getAGMT();  

    // Read sensor values (convert to proper units)
    float ax = myICM.accX() / 9.80665;           // m/s^2 → g
    float ay = myICM.accY() / 9.80665;
    float az = myICM.accZ() / 9.80665;

    float gx = myICM.gyrX() * 0.0174533;         // deg/s → rad/s
    float gy = myICM.gyrY() * 0.0174533;
    float gz = myICM.gyrZ() * 0.0174533;

    float mx = myICM.magX();
    float my = myICM.magY();
    float mz = myICM.magZ();

    // Update filter (with magnetometer)
    filter.update(gx, gy, gz, ax, ay, az, mx, my, mz);

    // Extract roll, pitch, yaw from filter
    float roll  = filter.getRoll();
    float pitch = filter.getPitch();
    float yaw   = filter.getYaw();

    // Normalize yaw to [0,360)
    if (yaw < 0) yaw += 360.0;

    // Output to Python
    SERIAL_PORT.print(roll); SERIAL_PORT.print(",");
    SERIAL_PORT.print(pitch); SERIAL_PORT.print(",");
    SERIAL_PORT.println(yaw);

    delay(5);
  }
}
