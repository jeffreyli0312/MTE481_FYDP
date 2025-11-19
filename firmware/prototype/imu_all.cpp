#include "ICM_20948.h"

#define SERIAL_PORT Serial
#define WIRE_PORT Wire
#define AD0_VAL 1

ICM_20948_I2C myICM;

// Gyro integration for yaw
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

    // Read accelerometer (in g's)
    float ax = myICM.accX();
    float ay = myICM.accY();
    float az = myICM.accZ();

    // Read gyroscope (in deg/s)
    float gz = myICM.gyrZ();

    // Calculate roll and pitch from accelerometer
    float roll  = atan2(ay, az) * 180.0 / PI;
    float pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0 / PI;

    // Integrate gyro Z to get yaw
    unsigned long now = micros();
    float dt = (now - last_t) * 1e-6;  // convert µs → seconds
    last_t = now;

    yaw_gyro += gz * dt;

    // Wrap yaw within 0–360 degrees
    if (yaw_gyro >= 360.0f) yaw_gyro -= 360.0f;
    if (yaw_gyro <   0.0f) yaw_gyro += 360.0f;

    // Output: roll,pitch,yaw,ax,ay,az
    SERIAL_PORT.print(roll);     SERIAL_PORT.print(",");
    SERIAL_PORT.print(pitch);    SERIAL_PORT.print(",");
    SERIAL_PORT.print(yaw_gyro); SERIAL_PORT.print(",");
    SERIAL_PORT.print(ax);       SERIAL_PORT.print(",");
    SERIAL_PORT.print(ay);       SERIAL_PORT.print(",");
    SERIAL_PORT.println(az);

    delay(5);
  }
}
