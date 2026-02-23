import serial
import time
import numpy as np
import matplotlib.pyplot as plt
from collections import deque

# --- 1. Setup Connection ---
port = '/dev/cu.usbserial-0001'
baudrate = 115200 # Must match the baudrate in your ESP32 code

try:
    ser = serial.Serial(port, baudrate, timeout=1)
    print('Connection Successful!')
except Exception as e:
    print('Connection Failed. Check the port or ensure the serial monitor is closed.')
    raise e

# --- 2. Configuration ---
window_size = 20

# deques automatically push old data out when the maxlen is reached
raw_buffer = deque(np.zeros(100), maxlen=100)
smooth_buffer = deque(np.zeros(window_size), maxlen=window_size)

# Lists to store the rolling 10-second history for plotting
t_data = []
raw_data = []
smooth_data = []

# NEW: Lists to store ALL data for saving the complete record
all_t_data = []
all_raw_data = []
all_smooth_data = []

# --- 3. Setup Plot ---
plt.ion() # Enable interactive mode (equivalent to drawnow)
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 6))
fig.canvas.manager.set_window_title('EMG Signal Processing')

# Top Plot: Raw Data
line_raw, = ax1.plot([], [], color='gray')
ax1.set_title('Raw Signal')
ax1.set_ylabel('Voltage (V)')
ax1.grid(True, linestyle='--', alpha=0.6)

# Bottom Plot: Processed Data
line_smooth, = ax2.plot([], [], color='red', linewidth=2)
ax2.set_title('Filtered & Smoothed (Envelope)')
ax2.set_ylabel('Amplitude')
ax2.grid(True, linestyle='--', alpha=0.6)

start_time = time.time()
print('Filtering data... Close figure or press Ctrl+C to stop.')

# --- 4. Processing Loop ---
try:
    while plt.fignum_exists(fig.number): # Run while window is open
        # A. Read Data from ESP32
        try:
            # Read a line, decode bytes to string, and strip whitespace
            line = ser.readline().decode('utf-8').strip()
            if not line:
                continue
            v_raw = float(line)
        except ValueError:
            continue # Skip garbage data during startup

        # B. Update Baseline Buffer (Find DC center)
        raw_buffer.append(v_raw)
        baseline = np.mean(raw_buffer)

        # C. Step 1: Remove DC Offset
        v_ac = v_raw - baseline

        # D. Step 2: Rectify
        v_rect = abs(v_ac)

        # E. Step 3: Smooth (Moving Average)
        smooth_buffer.append(v_rect)
        v_envelope = np.mean(smooth_buffer)

        # F. Plotting & Storing
        t = time.time() - start_time
        
        # Add to rolling plot lists
        t_data.append(t)
        raw_data.append(v_raw)
        smooth_data.append(v_envelope)
        
        # NEW: Add to complete record lists
        all_t_data.append(t)
        all_raw_data.append(v_raw)
        all_smooth_data.append(v_envelope)

        # Scroll X-axis (Keep only the last 10 seconds of data in memory for the plot)
        while t_data and t_data[0] < t - 10:
            t_data.pop(0)
            raw_data.pop(0)
            smooth_data.pop(0)

        # Update the plot lines with new data
        line_raw.set_data(t_data, raw_data)
        line_smooth.set_data(t_data, smooth_data)

        # Adjust X-axis limits dynamically
        if t > 10:
            ax1.set_xlim(t - 10, t)
            ax2.set_xlim(t - 10, t)
        else:
            ax1.set_xlim(0, max(t, 1)) # Prevent plotting errors in the first second
            ax2.set_xlim(0, max(t, 1))

        # Dynamically scale Y-axis to fit the incoming data
        ax1.relim()
        ax1.autoscale_view(scalex=False, scaley=True)
        ax2.relim()
        ax2.autoscale_view(scalex=False, scaley=True)

        # Pause to let matplotlib update the UI (equivalent to drawnow limitrate)
        plt.pause(0.001)

except KeyboardInterrupt:
    print("\nStopped by user.")
finally:
    ser.close() # Always close the serial port
    print("Serial port closed.")
    
    # --- 5. Save ALL Data to CSV ---
    if all_t_data:
        print("Saving full recording to CSV...")
        # Stack the complete lists into columns
        data_matrix = np.column_stack((all_t_data, all_raw_data, all_smooth_data))
        filename = "emg_full_record.csv"
        
        # Save using NumPy
        np.savetxt(filename, data_matrix, delimiter=",", 
                   header="Time(s),Raw_Voltage,Smoothed_Envelope", comments='')
        print(f"Data successfully saved to '{filename}'.")
        
    plt.ioff()
    plt.show()  # Keep the final frame open