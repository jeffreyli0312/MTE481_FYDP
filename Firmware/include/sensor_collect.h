#ifndef SENSOR_COLLECT_H
#define SENSOR_COLLECT_H

#include <Wire.h>
#include "ICM_20948.h"   // SparkFun ICM-20948 library
#include "data_packet.h"

// =================================================================================
// PIN / I2C CONFIGURATION
// =================================================================================
#define EMG_PIN_LEFT_TRICEP   32   // ADC pin – left tricep
#define EMG_PIN_LEFT_PEC      35   // ADC pin – left pec
#define EMG_PIN_RIGHT_TRICEP  33   // ADC pin – right tricep
#define EMG_PIN_RIGHT_PEC     34   // ADC pin – right pec

// AD0 values: 1 = default SparkFun breakout address (0x69)
//             0 = ADR jumper closed           (0x68)
#define IMU_LEFT_AD0    1
#define IMU_RIGHT_AD0   0

// =================================================================================
// EMG SMOOTHING CONFIGURATION
// =================================================================================
#define EMG_RAW_BUF_SIZE    100   // Samples for DC baseline estimation
#define EMG_SMOOTH_BUF_SIZE  20   // Samples for envelope smoothing

// Per-channel circular buffers
struct EmgChannel {
    float rawBuf[EMG_RAW_BUF_SIZE]    = {0};
    float smoothBuf[EMG_SMOOTH_BUF_SIZE] = {0};
    int   rawIdx   = 0;
    int   smoothIdx = 0;
    float rawSum   = 0.0f;
    float smoothSum = 0.0f;
};

static EmgChannel emgCh[4]; // 0=L_Tri, 1=L_Pec, 2=R_Tri, 3=R_Pec

// =================================================================================
// IMU INSTANCES
// =================================================================================
static ICM_20948_I2C imuLeft;
static ICM_20948_I2C imuRight;
static bool rightImuReady = false;  // stays false until imuRight.begin() succeeds

// =================================================================================
// HELPERS
// =================================================================================

// Read one ADC pin and convert to voltage (ESP32 12-bit ADC, 3.3V ref)
static inline float adcToVoltage(int pin) {
    return (analogRead(pin) / 4095.0f) * 3.3f;
}

// Process a single EMG channel through baseline removal + envelope smoothing.
// Returns the envelope value in millivolts as int16 (scaled x1000).
static int16_t processEmgChannel(EmgChannel &ch, int pin) {
    float v_raw = adcToVoltage(pin);

    // Update baseline (long circular buffer)
    ch.rawSum -= ch.rawBuf[ch.rawIdx];
    ch.rawBuf[ch.rawIdx] = v_raw;
    ch.rawSum += v_raw;
    ch.rawIdx = (ch.rawIdx + 1) % EMG_RAW_BUF_SIZE;
    float baseline = ch.rawSum / EMG_RAW_BUF_SIZE;

    // DC removal + rectify
    float v_rect = fabsf(v_raw - baseline);

    // Smooth (envelope)
    ch.smoothSum -= ch.smoothBuf[ch.smoothIdx];
    ch.smoothBuf[ch.smoothIdx] = v_rect;
    ch.smoothSum += v_rect;
    ch.smoothIdx = (ch.smoothIdx + 1) % EMG_SMOOTH_BUF_SIZE;
    float envelope = ch.smoothSum / EMG_SMOOTH_BUF_SIZE;

    // Scale to int16: store millivolts (preserves 3 decimal places of a 0–3.3 V signal)
    return (int16_t)(envelope * 1000.0f);
}

// =================================================================================
// ORIENTATION CALCULATION
// Tilt-compensated approach with accelerometer + magnetometer
// Returns roll, pitch, yaw in centidegrees (×100) packed as int16.
// =================================================================================
struct Orientation { int16_t roll; int16_t pitch; int16_t yaw; };

static Orientation calcOrientation(ICM_20948_I2C &imu) {
    float ax = imu.accX(), ay = imu.accY(), az = imu.accZ();
    float mx = imu.magX(), my = imu.magY(), mz = imu.magZ();

    float roll  = atan2(ay, az) * 180.0f / PI;
    float pitch = atan2(-ax, sqrtf(ay * ay + az * az)) * 180.0f / PI;

    float rollRad  = roll  * PI / 180.0f;
    float pitchRad = pitch * PI / 180.0f;

    // Tilt-compensated magnetometer yaw (matches IMU_BLE.ino)
    float mx_comp =  mx * cosf(pitchRad) + mz * sinf(pitchRad);
    float my_comp =  mx * sinf(rollRad) * sinf(pitchRad)
                  +  my * cosf(rollRad)
                  -  mz * sinf(rollRad) * cosf(pitchRad);

    float yaw = atan2(-my_comp, mx_comp) * 180.0f / PI;
    // Keep yaw in -180..+180 so it fits int16 ×100 (±18000)

    return {
        (int16_t)(roll  * 100.0f),
        (int16_t)(pitch * 100.0f),
        (int16_t)(yaw   * 100.0f)
    };
}

/**
 * @brief  Initialize EMG ADC pins and both IMU sensors over I2C.
 *         Call once from setup().
 */
void Sensors_Init() {
    // EMG pins are ADC inputs by default on ESP32 – no pinMode needed,
    // but pre-fill baseline buffers to avoid startup spike.
    const int emgPins[4] = { EMG_PIN_LEFT_TRICEP, EMG_PIN_LEFT_PEC,
                               EMG_PIN_RIGHT_TRICEP, EMG_PIN_RIGHT_PEC };
    for (int ch = 0; ch < 4; ch++) {
        float init = adcToVoltage(emgPins[ch]);
        for (int i = 0; i < EMG_RAW_BUF_SIZE; i++) {
            emgCh[ch].rawBuf[i] = init;
            emgCh[ch].rawSum   += init;
        }
    }

    // I2C bus
    Wire.begin();
    Wire.setClock(400000);

    // Left IMU
    bool ok = false;
    while (!ok) {
        imuLeft.begin(Wire, IMU_LEFT_AD0);
        if (imuLeft.status == ICM_20948_Stat_Ok) { ok = true; }
        else { Serial.println("Left IMU init failed, retrying..."); delay(500); }
    }
    Serial.println("Left IMU OK.");

    // Right IMU — non-blocking: marks rightImuReady false if not found
    imuRight.begin(Wire, IMU_RIGHT_AD0);
    if (imuRight.status == ICM_20948_Stat_Ok) {
        rightImuReady = true;
        Serial.println("Right IMU OK.");
    } else {
        rightImuReady = false;
        Serial.println("Right IMU NOT found — skipping.");
    }
}

/**
 * @brief  Read all sensors and fill the WorkoutDataPacket_t inside the given
 *         PacketBuffer_u.  Mirrors the logic in data_compile.c:Collect_And_Send_Data().
 *
 * @param  buf  Reference to the global PacketBuffer_u that will be transmitted.
 */
void Sensors_Collect(PacketBuffer_u &buf) {

    // 1. Timestamp
    buf.packet.timestamp_ms = millis();

    // 2. EMG – four channels (envelope, scaled to int16 millivolts)
    buf.packet.left_tricep  = processEmgChannel(emgCh[0], EMG_PIN_LEFT_TRICEP);
    buf.packet.left_pec     = processEmgChannel(emgCh[1], EMG_PIN_LEFT_PEC);
    buf.packet.right_tricep = processEmgChannel(emgCh[2], EMG_PIN_RIGHT_TRICEP);
    buf.packet.right_pec    = processEmgChannel(emgCh[3], EMG_PIN_RIGHT_PEC);

    // 3. Left IMU – accel (mg) and orientation (centidegrees ×100) into int16
    if (imuLeft.dataReady()) {
        imuLeft.getAGMT();
        buf.packet.left_acc_x = (int16_t)imuLeft.accX();
        buf.packet.left_acc_y = (int16_t)imuLeft.accY();
        buf.packet.left_acc_z = (int16_t)imuLeft.accZ();
        Orientation ori = calcOrientation(imuLeft);
        buf.packet.left_roll  = ori.roll;
        buf.packet.left_pitch = ori.pitch;
        buf.packet.left_yaw   = ori.yaw;
    }

    // 4. Right IMU — only access if successfully initialized
    if (rightImuReady && imuRight.dataReady()) {
        imuRight.getAGMT();
        buf.packet.right_acc_x = (int16_t)imuRight.accX();
        buf.packet.right_acc_y = (int16_t)imuRight.accY();
        buf.packet.right_acc_z = (int16_t)imuRight.accZ();
        Orientation ori = calcOrientation(imuRight);
        buf.packet.right_roll  = ori.roll;
        buf.packet.right_pitch = ori.pitch;
        buf.packet.right_yaw   = ori.yaw;
    }
}

#endif // SENSOR_COLLECT_H
