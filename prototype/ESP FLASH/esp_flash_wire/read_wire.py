import serial
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque

# --- Configuration ---
SERIAL_PORT = '/dev/cu.usbserial-0001'  # Change this if your Mac assigns a different port
BAUD_RATE = 115200
MAX_POINTS = 150

# Data Buffers
t_data = deque(maxlen=MAX_POINTS)
roll_data = deque(maxlen=MAX_POINTS)
pitch_data = deque(maxlen=MAX_POINTS)
yaw_data = deque(maxlen=MAX_POINTS)
ax_data = deque(maxlen=MAX_POINTS)
ay_data = deque(maxlen=MAX_POINTS)
az_data = deque(maxlen=MAX_POINTS)
raw_emg_data = deque(maxlen=MAX_POINTS)
env_emg_data = deque(maxlen=MAX_POINTS)

sample_count = 0

# --- Connect to Serial ---
try:
    # timeout is set to 0.01s so reading doesn't block the animation loop
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0.01)
    ser.reset_input_buffer()
    print(f"Connected to {SERIAL_PORT}")
except Exception as e:
    print(f"Failed to connect. Make sure the port is correct and Arduino Serial Monitor is closed.\nError: {e}")
    exit()

# --- Setup 3 Subplots ---
fig, (ax_ori, ax_acc, ax_emg) = plt.subplots(3, 1, figsize=(10, 10), sharex=True)
fig.suptitle('Wired IMU & EMG Telemetry', fontsize=16)

# 1. Orientation
ax_ori.set_ylabel('Angle (°)')
line_roll, = ax_ori.plot([], [], label='Roll', color='blue')
line_pitch, = ax_ori.plot([], [], label='Pitch', color='red')
line_yaw, = ax_ori.plot([], [], label='Yaw', color='green')
ax_ori.legend(loc='upper right')
ax_ori.grid(True)

# 2. Acceleration
ax_acc.set_ylabel('Accel (g)')
line_ax, = ax_acc.plot([], [], label='Acc X', color='blue')
line_ay, = ax_acc.plot([], [], label='Acc Y', color='red')
line_az, = ax_acc.plot([], [], label='Acc Z', color='green')
ax_acc.legend(loc='upper right')
ax_acc.grid(True)

# 3. EMG 
ax_emg.set_ylabel('Voltage (V)')
ax_emg.set_xlabel('Samples')
line_raw_emg, = ax_emg.plot([], [], color='gray', label='Raw EMG', alpha=0.5)
line_env_emg, = ax_emg.plot([], [], color='red', linewidth=2, label='Envelope')
ax_emg.legend(loc='upper right')
ax_emg.grid(True)

def update_plot(frame):
    global sample_count
    
    # Read all lines currently sitting in the serial buffer
    while ser.in_waiting > 0:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if line:
            try:
                # Unpack 8 variables from the ESP32 string
                roll, pitch, yaw, ax, ay, az, v_raw, v_env = map(float, line.split(','))
                
                t_data.append(sample_count)
                roll_data.append(roll)
                pitch_data.append(pitch)
                yaw_data.append(yaw)
                ax_data.append(ax)
                ay_data.append(ay)
                az_data.append(az)
                raw_emg_data.append(v_raw)
                env_emg_data.append(v_env)
                sample_count += 1
            except ValueError:
                # Catch partial lines or garbled data when first connecting
                pass 

    # Update plots if we have data
    if len(t_data) > 0:
        line_roll.set_data(t_data, roll_data)
        line_pitch.set_data(t_data, pitch_data)
        line_yaw.set_data(t_data, yaw_data)
        line_ax.set_data(t_data, ax_data)
        line_ay.set_data(t_data, ay_data)
        line_az.set_data(t_data, az_data)
        line_raw_emg.set_data(t_data, raw_emg_data)
        line_env_emg.set_data(t_data, env_emg_data)
        
        for axis in (ax_ori, ax_acc, ax_emg):
            axis.set_xlim(max(0, sample_count - MAX_POINTS), max(MAX_POINTS, sample_count))
            axis.relim()
            axis.autoscale_view(scaley=True, scalex=False)

    return line_roll, line_pitch, line_yaw, line_ax, line_ay, line_az, line_raw_emg, line_env_emg

# interval=20 means update the plot every 20ms
ani = animation.FuncAnimation(fig, update_plot, interval=20, blit=False, cache_frame_data=False)

try:
    plt.tight_layout()
    plt.show()
except KeyboardInterrupt:
    print("Plot closed.")
finally:
    ser.close()
    print("Serial port closed.")