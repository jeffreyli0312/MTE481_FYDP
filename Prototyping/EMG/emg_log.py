import serial
import time
import csv

# --- CONFIGURATION ---
serial_port = 'COM3'  # Change to your Arduino port (e.g., '/dev/ttyUSB0' on Linux/Mac)
baud_rate = 115200    # Must match Serial.begin in Arduino code
output_file = 'emg_data.txt'
# ---------------------

try:
    ser = serial.Serial(serial_port, baud_rate)
    print(f"Connected to {serial_port}. Logging to {output_file}...")
    print("Press Ctrl+C to stop logging.")
    
    with open(output_file, mode='w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(["Time_ms", "EMG_Value"]) # Write Header
        
        while True:
            if ser.in_waiting > 0:
                try:
                    # Read line from Arduino
                    line = ser.readline().decode('utf-8').strip()
                    
                    # Split into time and value
                    if ',' in line:
                        data = line.split(',')
                        writer.writerow(data)
                        print(f"Logged: {data}") # Optional: print to console
                except UnicodeDecodeError:
                    pass # Ignore generic serial noise errors

except serial.SerialException:
    print(f"Error: Could not open {serial_port}. Is it in use?")
except KeyboardInterrupt:
    print("\nLogging stopped. File saved.")
    if 'ser' in locals() and ser.is_open:
        ser.close()