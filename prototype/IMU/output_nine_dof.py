import serial
import time
import os
import csv
from datetime import datetime

# ---------------- Serial Setup ----------------
ser = serial.Serial('COM3', 115200, timeout=0.5)  # Change COM port if needed
time.sleep(2)  # Allow Arduino to reset

print("\n🔍 Listening for IMU data...\n")

# ---------------- Folder + CSV Setup ----------------
folder_name = "nine_dof_outputs"

# Create subfolder if not exist
if not os.path.exists(folder_name):
    os.makedirs(folder_name)

# Create timestamped CSV file
filename = datetime.now().strftime("imu_9dof_%Y%m%d_%H%M%S.csv")
csv_path = os.path.join(folder_name, filename)

csv_file = open(csv_path, "w", newline="")
csv_writer = csv.writer(csv_file)

# Write header row
csv_writer.writerow([
    "AccX", "AccY", "AccZ",
    "GyrX", "GyrY", "GyrZ",
    "MagX", "MagY", "MagZ",
    "Temp_C"
])

print(f"📁 Saving data to: {csv_path}\n")


# ---------------- Parsing Function ----------------
def parse_imu_line(line):
    """Parse 'Label:value' pairs into a dictionary."""
    parts = line.split('\t')
    data = {}

    for p in parts:
        if ":" in p:
            key, val = p.split(":")
            try:
                data[key.strip()] = float(val.strip())
            except:
                data[key.strip()] = None

    return data


# ---------------- Main Loop ----------------
while True:
    try:
        raw = ser.readline().decode('ascii', errors='ignore').strip()
        if not raw:
            continue

        data = parse_imu_line(raw)

        # Extract values safely
        accx = data.get("AccX", 0)
        accy = data.get("AccY", 0)
        accz = data.get("AccZ", 0)
        gyrx = data.get("GyrX", 0)
        gyry = data.get("GyrY", 0)
        gyrz = data.get("GyrZ", 0)
        magx = data.get("MagX", 0)
        magy = data.get("MagY", 0)
        magz = data.get("MagZ", 0)
        temp = data.get("Temp", 0)

        # Print formatted line
        print(
            f"Acc = [{accx:6.2f}, {accy:6.2f}, {accz:6.2f}] | "
            f"Gyr = [{gyrx:6.2f}, {gyry:6.2f}, {gyrz:6.2f}] | "
            f"Mag = [{magx:6.2f}, {magy:6.2f}, {magz:6.2f}] | "
            f"Temp = {temp:5.2f}°C"
        )

        # Write to CSV
        csv_writer.writerow([
            accx, accy, accz,
            gyrx, gyry, gyrz,
            magx, magy, magz,
            temp
        ])
        csv_file.flush()

    except KeyboardInterrupt:
        print("\n🛑 Exiting and closing files.")
        csv_file.close()
        break

    except Exception as e:
        print("⚠️ Error:", e)
