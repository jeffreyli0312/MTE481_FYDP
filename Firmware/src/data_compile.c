#include "data_packet.h"
#include <stdbool.h>

// Global instance of the data packet
PacketBuffer_u tx_buffer;

// --- Mock Hardware Functions (Replace these with your actual HAL calls) ---
extern uint32_t HAL_GetTick(void);                 // Returns current time in ms
extern int16_t  ADC_Read_Channel(uint8_t channel); // Reads specific EMG ADC
extern void     IMU_Read_Burst(uint8_t imu_id, int16_t* data_out); // Reads 6 axes at once
extern void     BLE_Send_Notify(uint8_t* data, uint16_t len);

/**
 * @brief  Collects data from all sensors and sends a synchronized packet.
 * @note   Call this function at your desired sampling rate (e.g., inside a 100Hz Timer ISR).
 */
void Collect_And_Send_Data(void) {
    
    // 1. Capture the exact moment this snapshot was taken
    tx_buffer.packet.timestamp_ms = HAL_GetTick();

    // 2. Collect EMG Data (Sequential ADC Reads)
    // Assuming channels: 0=L_Tri, 1=L_Pec, 2=R_Tri, 3=R_Pec
    tx_buffer.packet.left_tricep  = ADC_Read_Channel(0);
    tx_buffer.packet.left_pec     = ADC_Read_Channel(1);
    tx_buffer.packet.right_tricep = ADC_Read_Channel(2);
    tx_buffer.packet.right_pec    = ADC_Read_Channel(3);

    // 3. Collect Left IMU Data
    // We create a temporary array to hold the 6 axes (Accel X/Y/Z + Gyro X/Y/Z)
    int16_t imu_temp_buffer[6];
    
    IMU_Read_Burst(0, imu_temp_buffer); // Read Left IMU (ID 0)
    tx_buffer.packet.left_acc_x = imu_temp_buffer[0];
    tx_buffer.packet.left_acc_y = imu_temp_buffer[1];
    tx_buffer.packet.left_acc_z = imu_temp_buffer[2];
    tx_buffer.packet.left_gyr_x = imu_temp_buffer[3];
    tx_buffer.packet.left_gyr_y = imu_temp_buffer[4];
    tx_buffer.packet.left_gyr_z = imu_temp_buffer[5];

    // 4. Collect Right IMU Data
    IMU_Read_Burst(1, imu_temp_buffer); // Read Right IMU (ID 1)
    tx_buffer.packet.right_acc_x = imu_temp_buffer[0];
    tx_buffer.packet.right_acc_y = imu_temp_buffer[1];
    tx_buffer.packet.right_acc_z = imu_temp_buffer[2];
    tx_buffer.packet.right_gyr_x = imu_temp_buffer[3];
    tx_buffer.packet.right_gyr_y = imu_temp_buffer[4];
    tx_buffer.packet.right_gyr_z = imu_temp_buffer[5];

    // 5. Send the synchronized snapshot
    // We send 'raw_bytes' which is exactly 36 bytes long
    BLE_Send_Notify(tx_buffer.raw_bytes, sizeof(WorkoutDataPacket_t));
}