import serial
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque

# --- Configuration ---
SERIAL_PORT = '/dev/cu.usbserial-0001' # Update if your port changes
BAUD_RATE = 115200
MAX_POINTS = 200 # Increased to 200 so you can see a longer history of the flex

# Initialize deques to hold data
t_data = deque(maxlen=MAX_POINTS)
raw_data = deque(maxlen=MAX_POINTS)
env_data = deque(maxlen=MAX_POINTS)

# Connect to the Serial Port
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    ser.reset_input_buffer()
    print(f"Connected to {SERIAL_PORT}")
except Exception as e:
    print(f"Failed to connect on {SERIAL_PORT}. Error: {e}")
    exit()

# --- Setup 2 Subplots ---
fig, (ax_raw, ax_env) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)
fig.suptitle('Live EMG Signal Processing', fontsize=14)

# Top Plot: Raw Data
ax_raw.set_title('Raw Signal')
ax_raw.set_ylabel('Voltage (V)')
line_raw, = ax_raw.plot([], [], color='gray', label='Raw (0 - 3.3V)')
ax_raw.grid(True)
ax_raw.legend(loc='upper right')

# Bottom Plot: Processed Data (The clean one)
ax_env.set_title('Filtered & Smoothed (Envelope)')
ax_env.set_ylabel('Amplitude (V)')
ax_env.set_xlabel('Samples')
line_env, = ax_env.plot([], [], color='red', linewidth=2, label='Envelope')
ax_env.grid(True)
ax_env.legend(loc='upper right')

sample_count = 0 

def update_plot(frame):
    global sample_count
    
    # Read a line from the serial port
    line = ser.readline().decode('utf-8', errors='ignore').strip()
    
    if line:
        try:
            # Parse the comma-separated values (v_raw, v_envelope)
            v_raw, v_envelope = map(float, line.split(','))
            
            # Append to our data buffers
            t_data.append(sample_count)
            raw_data.append(v_raw)
            env_data.append(v_envelope)
            sample_count += 1
            
            # Update the lines with new data
            line_raw.set_data(t_data, raw_data)
            line_env.set_data(t_data, env_data)
            
            # Scroll X-axis and Auto-scale Y-axis for both plots
            for ax in (ax_raw, ax_env):
                ax.set_xlim(max(0, sample_count - MAX_POINTS), max(MAX_POINTS, sample_count))
                ax.relim()
                ax.autoscale_view(scaley=True, scalex=False)
            
        except ValueError:
            # Ignore garbled data that sometimes happens right when connecting
            pass 

    return line_raw, line_env

# --- Run Animation ---
# interval=10 roughly matches the 10ms delay in your Arduino code
ani = animation.FuncAnimation(fig, update_plot, interval=10, blit=False, cache_frame_data=False)

try:
    plt.tight_layout()
    plt.show()
except KeyboardInterrupt:
    print("Plot closed by user.")
finally:
    ser.close()
    print("Serial port closed.")