#ifndef DATA_PACKET_H
#define DATA_PACKET_H

#include <stdint.h>

// =================================================================================
// BYTE OFFSET DEFINITIONS
// Useful for debugging raw hex dumps or parsing on the mobile side.
// =================================================================================
#define OFFSET_TIMESTAMP    0   // uint32_t  (bytes 0-3)
#define OFFSET_EMG_START    4   // int16_t x4 (bytes 4-11)
#define OFFSET_IMU_L_START  12  // int16_t x6 (bytes 12-23)
#define OFFSET_IMU_R_START  24  // int16_t x6 (bytes 24-35)
#define TOTAL_PACKET_SIZE   36  // Total bytes in the BLE notification

// =================================================================================
// PACKED STRUCT DEFINITION
// No padding bytes — maps exactly to the 36-byte layout.
// =================================================================================
typedef struct __attribute__((packed)) {

    // --- Header (Bytes 0-3) ---
    uint32_t timestamp_ms;      // millis() since boot

    // --- EMG Data (Bytes 4-11) ---
    // Raw ADC values scaled to int16 (multiply float voltage * 1000 to preserve 3 decimals)
    int16_t  left_tricep;       // Bytes 4-5
    int16_t  left_pec;          // Bytes 6-7
    int16_t  right_tricep;      // Bytes 8-9
    int16_t  right_pec;         // Bytes 10-11

    // --- Left IMU (Bytes 12-23) ---
    // Accel in mg (int16), orientation in centidegrees ×100 (int16, range ±18000)
    int16_t  left_acc_x;        // Bytes 12-13
    int16_t  left_acc_y;        // Bytes 14-15
    int16_t  left_acc_z;        // Bytes 16-17
    int16_t  left_roll;         // Bytes 18-19  (centidegrees, ×100)
    int16_t  left_pitch;        // Bytes 20-21  (centidegrees, ×100)
    int16_t  left_yaw;          // Bytes 22-23  (centidegrees, ×100)

    // --- Right IMU (Bytes 24-35) ---
    int16_t  right_acc_x;       // Bytes 24-25
    int16_t  right_acc_y;       // Bytes 26-27
    int16_t  right_acc_z;       // Bytes 28-29
    int16_t  right_roll;        // Bytes 30-31  (centidegrees, ×100)
    int16_t  right_pitch;       // Bytes 32-33  (centidegrees, ×100)
    int16_t  right_yaw;         // Bytes 34-35  (centidegrees, ×100)

} WorkoutDataPacket_t;

// =================================================================================
// UNION: lets us treat the struct as a raw byte array for BLE notify
// =================================================================================
typedef union {
    WorkoutDataPacket_t packet;
    uint8_t             raw_bytes[TOTAL_PACKET_SIZE];
} PacketBuffer_u;

#endif // DATA_PACKET_H
