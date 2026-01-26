import pandas as pd
import matplotlib.pyplot as plt
import sys

# Check if filename is provided
if len(sys.argv) < 2:
    print("Usage: python plot_imu_data.py <csv_filename>")
    print("Example: python plot_imu_data.py imu_all_data_20251119_172250.csv")
    sys.exit(1)

csv_filename = sys.argv[1]

# Read the CSV file
# df = pd.read_csv(csv_filename)
df = pd.read_csv("meow.csv")

# Create a figure with 2 rows and 2 columns of subplots
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle(f'IMU Data Analysis - {csv_filename}', fontsize=16)

# Plot 1: Roll, Pitch, Yaw vs Time
axes[0, 0].plot(df['time'], df['roll'], label='Roll', alpha=0.7)
axes[0, 0].plot(df['time'], df['pitch'], label='Pitch', alpha=0.7)
axes[0, 0].plot(df['time'], df['yaw'], label='Yaw', alpha=0.7)
axes[0, 0].set_xlabel('Time (seconds)')
axes[0, 0].set_ylabel('Angle (degrees)')
axes[0, 0].set_title('Orientation (Roll, Pitch, Yaw)')
axes[0, 0].legend()
axes[0, 0].grid(True, alpha=0.3)

# Plot 2: Yaw Only (larger view)
axes[0, 1].plot(df['time'], df['yaw'], color='blue', linewidth=1.5)
axes[0, 1].set_xlabel('Time (seconds)')
axes[0, 1].set_ylabel('Yaw Angle (degrees)')
axes[0, 1].set_title('Yaw Over Time')
axes[0, 1].grid(True, alpha=0.3)

# Plot 3: Accelerometer X, Y, Z
axes[1, 0].plot(df['time'], df['ax'], label='X-axis', alpha=0.7)
axes[1, 0].plot(df['time'], df['ay'], label='Y-axis', alpha=0.7)
axes[1, 0].plot(df['time'], df['az'], label='Z-axis', alpha=0.7)
axes[1, 0].set_xlabel('Time (seconds)')
axes[1, 0].set_ylabel('Acceleration (g)')
axes[1, 0].set_title('Accelerometer Data')
axes[1, 0].legend()
axes[1, 0].grid(True, alpha=0.3)

# Plot 4: 3D Accelerometer trajectory
ax_3d = fig.add_subplot(2, 2, 4, projection='3d')
ax_3d.plot(df['ax'], df['ay'], df['az'], alpha=0.5, linewidth=0.5)
ax_3d.scatter(df['ax'].iloc[0], df['ay'].iloc[0], df['az'].iloc[0], 
              color='green', s=100, label='Start', marker='o')
ax_3d.scatter(df['ax'].iloc[-1], df['ay'].iloc[-1], df['az'].iloc[-1], 
              color='red', s=100, label='End', marker='x')
ax_3d.set_xlabel('X (g)')
ax_3d.set_ylabel('Y (g)')
ax_3d.set_zlabel('Z (g)')
ax_3d.set_title('Accelerometer 3D Trajectory')
ax_3d.legend()

plt.tight_layout()
plt.show()

# Print summary statistics
print("\n=== Data Summary ===")
print(f"Duration: {df['time'].iloc[-1]:.2f} seconds")
print(f"Number of samples: {len(df)}")
print(f"Sample rate: {len(df) / df['time'].iloc[-1]:.2f} Hz")
print("\nYaw Statistics:")
print(f"  Min: {df['yaw'].min():.2f}°")
print(f"  Max: {df['yaw'].max():.2f}°")
print(f"  Mean: {df['yaw'].mean():.2f}°")
print(f"  Std Dev: {df['yaw'].std():.2f}°")
print("\nAccelerometer Magnitude:")
acc_magnitude = (df['ax']**2 + df['ay']**2 + df['az']**2)**0.5
print(f"  Mean: {acc_magnitude.mean():.3f} g")
print(f"  Std Dev: {acc_magnitude.std():.3f} g")

