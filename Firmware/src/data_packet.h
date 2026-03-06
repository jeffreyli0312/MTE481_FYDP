#ifndef DATA_PACKET_H
#define DATA_PACKET_H

#include <stdint.h>
#include <string.h>

// =================================================================================
// 1. BYTE OFFSET DEFINITIONS
// =================================================================================
// These macros are useful for the receiving side (Mobile App) to parse the blob
// or for debugging raw hex dumps.

#define OFFSET_TIMESTAMP    0
#define OFFSET_EMG_START    4
#define OFFSET_IMU_L_START  12
#define OFFSET_IMU_R_START  24
#define TOTAL_PACKET_SIZE   36  // Total bytes in the stream

// =================================================================================
// 2. PACKED STRUCT DEFINITION
// =================================================================================

/* * This struct maps perfectly to your 36-byte table.
 * No padding bytes are inserted by the compiler.
 */
#ifdef _MSC_VER
    #define PACKED_STRUCT __pragma(pack(push, 1))
    #define END_PACKED_STRUCT __pragma(pack(pop))
#else
    #define PACKED_STRUCT
    #define END_PACKED_STRUCT __attribute__((packed))
#endif

// Now use them like this:
PACKED_STRUCT
typedef struct {
    uint32_t timestamp_ms;

    int16_t  left_tricep;
    int16_t  left_pec;
    int16_t  right_tricep;
    int16_t  right_pec;

    int16_t  left_acc_x;
    int16_t  left_acc_y;
    int16_t  left_acc_z;
    int16_t  left_gyr_x;
    int16_t  left_gyr_y;
    int16_t  left_gyr_z;

    int16_t  right_acc_x;
    int16_t  right_acc_y;
    int16_t  right_acc_z;
    int16_t  right_gyr_x;
    int16_t  right_gyr_y;
    int16_t  right_gyr_z;

} END_PACKED_STRUCT WorkoutDataPacket_t;

// Union to allow easy casting to a byte array for BLE
typedef union {
    WorkoutDataPacket_t packet;
    uint8_t             raw_bytes[TOTAL_PACKET_SIZE];
} PacketBuffer_u;

#endif // DATA_PACKET_H