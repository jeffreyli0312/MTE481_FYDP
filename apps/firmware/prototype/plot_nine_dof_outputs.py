import pandas as pd
import matplotlib.pyplot as plt
import os

# ---------------- Select CSV File ----------------
# Example: "nine_dof_outputs/imu_9dof_20251120_181223.csv"
# csv_path = input("Enter path to IMU CSV file: ").strip()
csv_path = "nine_dof_outputs\imu_9dof_20251120_202316.csv"

if not os.path.exists(csv_path):
    print("❌ File not found.")
    exit()

# ---------------- load data ----------------
df = pd.read_csv(csv_path)

# Add a time column (0, 1, 2, ... based on row index)
df["Time"] = df.index * 0.03   # ~30 ms interval, adjust if needed

# ---------------- Plot all signals ----------------
fig, axs = plt.subplots(4, 1, figsize=(12, 14), sharex=True)

# 1. Accelerometer
axs[0].plot(df["Time"], df["AccX"], label="AccX")
axs[0].plot(df["Time"], df["AccY"], label="AccY")
axs[0].plot(df["Time"], df["AccZ"], label="AccZ")
axs[0].set_title("Accelerometer (g)")
axs[0].set_ylabel("g")
axs[0].legend()
axs[0].grid(True)

# 2. Gyroscope
axs[1].plot(df["Time"], df["GyrX"], label="GyrX")
axs[1].plot(df["Time"], df["GyrY"], label="GyrY")
axs[1].plot(df["Time"], df["GyrZ"], label="GyrZ")
axs[1].set_title("Gyroscope (deg/sec)")
axs[1].set_ylabel("deg/s")
axs[1].legend()
axs[1].grid(True)

# 3. Magnetometer
axs[2].plot(df["Time"], df["MagX"], label="MagX")
axs[2].plot(df["Time"], df["MagY"], label="MagY")
axs[2].plot(df["Time"], df["MagZ"], label="MagZ")
axs[2].set_title("Magnetometer (uT)")
axs[2].set_ylabel("uT")
axs[2].legend()
axs[2].grid(True)

# 4. Temperature
axs[3].plot(df["Time"], df["Temp_C"], label="Temp", color='red')
axs[3].set_title("Temperature (°C)")
axs[3].set_xlabel("Time (s)")
axs[3].set_ylabel("°C")
axs[3].legend()
axs[3].grid(True)

plt.tight_layout()
plt.show()
