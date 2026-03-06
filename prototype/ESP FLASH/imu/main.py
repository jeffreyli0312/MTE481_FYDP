import serial
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque

# --- Configuration ---
SERIAL_PORT = '/dev/cu.usbserial-0001'
BAUD_RATE = 115200
MAX_POINTS = 100

# Initialize deques for 6 variables
t_data = deque(maxlen=MAX_POINTS)

# Orientation
roll_data = deque(maxlen=MAX_POINTS)
pitch_data = deque(maxlen=MAX_POINTS)
yaw_data = deque(maxlen=MAX_POINTS)

# Accelerometer
ax_data = deque(maxlen=MAX_POINTS)
ay_data = deque(maxlen=MAX_POINTS)
az_data = deque(maxlen=MAX_POINTS)

# Connect to the Serial Port
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    ser.reset_input_buffer()
    print(f"Connected to {SERIAL_PORT}")
except Exception as e:
    print(f"Failed to connect on {SERIAL_PORT}. Error: {e}")
    exit()

# --- Setup 2 Subplots ---
fig, (ax_ori, ax_acc) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)
fig.suptitle('IMU Telemetry: Orientation & Acceleration', fontsize=14)

# Plot 1: Orientation
ax_ori.set_ylabel('Angle (°)')
line_roll, = ax_ori.plot([], [], label='Roll', color='blue')
line_pitch, = ax_ori.plot([], [], label='Pitch', color='red')
line_yaw, = ax_ori.plot([], [], label='Yaw', color='green')
ax_ori.legend(loc='upper right')
ax_ori.grid(True)

# Plot 2: Accelerometer
ax_acc.set_ylabel('Accel (g)')
ax_acc.set_xlabel('Samples')
line_ax, = ax_acc.plot([], [], label='Acc X', color='blue')
line_ay, = ax_acc.plot([], [], label='Acc Y', color='red')
line_az, = ax_acc.plot([], [], label='Acc Z', color='green')
ax_acc.legend(loc='upper right')
ax_acc.grid(True)

# Group axes and lines
axes = [ax_ori, ax_acc]
all_lines = (line_roll, line_pitch, line_yaw, line_ax, line_ay, line_az)

sample_count = 0 

def update_plot(frame):
    global sample_count
    line = ser.readline().decode('utf-8', errors='ignore').strip()
    
    if line:
        try:
            # Parse 6 values
            roll, pitch, yaw, ax, ay, az = map(float, line.split(','))
            
            # Append data
            t_data.append(sample_count)
            roll_data.append(roll)
            pitch_data.append(pitch)
            yaw_data.append(yaw)
            ax_data.append(ax)
            ay_data.append(ay)
            az_data.append(az)
            sample_count += 1
            
            # Update lines
            line_roll.set_data(t_data, roll_data)
            line_pitch.set_data(t_data, pitch_data)
            line_yaw.set_data(t_data, yaw_data)
            
            line_ax.set_data(t_data, ax_data)
            line_ay.set_data(t_data, ay_data)
            line_az.set_data(t_data, az_data)
            
            # Auto-scale subplots
            for axis in axes:
                axis.set_xlim(max(0, sample_count - MAX_POINTS), max(MAX_POINTS, sample_count))
                axis.relim()
                axis.autoscale_view(scaley=True, scalex=False)
            
        except ValueError:
            pass 

    return all_lines

# --- Run Animation ---
ani = animation.FuncAnimation(fig, update_plot, interval=30, blit=False, cache_frame_data=False)

try:
    plt.tight_layout()
    plt.show()
except KeyboardInterrupt:
    print("Plot closed by user.")
finally:
    ser.close()
    print("Serial port closed.")