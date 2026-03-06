import asyncio
import threading
import queue
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque
from bleak import BleakClient, BleakScanner

# --- BLE Configuration ---
CHARACTERISTIC_UUID_TX = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" 

# --- Plot Configuration ---
MAX_POINTS_IMU = 100
MAX_POINTS_EMG = 200

# IMU Data Buffers
t_imu = deque(maxlen=MAX_POINTS_IMU)
roll_data = deque(maxlen=MAX_POINTS_IMU)
pitch_data = deque(maxlen=MAX_POINTS_IMU)
yaw_data = deque(maxlen=MAX_POINTS_IMU)
ax_data = deque(maxlen=MAX_POINTS_IMU)
ay_data = deque(maxlen=MAX_POINTS_IMU)
az_data = deque(maxlen=MAX_POINTS_IMU)

# EMG Data Buffers
t_emg = deque(maxlen=MAX_POINTS_EMG)
raw_emg_data = deque(maxlen=MAX_POINTS_EMG)
env_emg_data = deque(maxlen=MAX_POINTS_EMG)

# Independent Queues and Counters
imu_queue = queue.Queue()
emg_queue = queue.Queue()
imu_sample_count = 0
emg_sample_count = 0

# --- BLE Functions ---
def imu_handler(sender, data):
    imu_queue.put(data.decode('utf-8').strip())

def emg_handler(sender, data):
    emg_queue.put(data.decode('utf-8').strip())

async def connect_and_listen(device, handler, name):
    if not device:
        print(f"{name} not found. Make sure it is powered on.")
        return
        
    try:
        async with BleakClient(device) as client:
            print(f"Connected to {name}!")
            await client.start_notify(CHARACTERISTIC_UUID_TX, handler)
            # Keep connection alive
            while True:
                await asyncio.sleep(1)
    except Exception as e:
        print(f"Connection lost or failed for {name}: {e}")

async def run_ble():
    print("Scanning for ESP32_IMU and ESP32_EMG...")
    devices = await BleakScanner.discover(timeout=5.0)
    
    imu_device = next((d for d in devices if d.name == "ESP32_IMU"), None)
    emg_device = next((d for d in devices if d.name == "ESP32_EMG"), None)

    # Run both connections simultaneously
    await asyncio.gather(
        connect_and_listen(imu_device, imu_handler, "ESP32_IMU"),
        connect_and_listen(emg_device, emg_handler, "ESP32_EMG")
    )

def start_ble_thread():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_ble())

# Start BLE in the background
threading.Thread(target=start_ble_thread, daemon=True).start()

# --- Setup 3 Subplots ---
fig, (ax_ori, ax_acc, ax_emg) = plt.subplots(3, 1, figsize=(10, 10))
fig.suptitle('Live Biomechanics Telemetry', fontsize=16)

# 1. IMU Orientation
ax_ori.set_ylabel('Angle (°)')
line_roll, = ax_ori.plot([], [], label='Roll', color='blue')
line_pitch, = ax_ori.plot([], [], label='Pitch', color='red')
line_yaw, = ax_ori.plot([], [], label='Yaw', color='green')
ax_ori.legend(loc='upper right')
ax_ori.grid(True)

# 2. IMU Accelerometer
ax_acc.set_ylabel('Accel (g)')
line_ax, = ax_acc.plot([], [], label='Acc X', color='blue')
line_ay, = ax_acc.plot([], [], label='Acc Y', color='red')
line_az, = ax_acc.plot([], [], label='Acc Z', color='green')
ax_acc.legend(loc='upper right')
ax_acc.grid(True)

# 3. EMG Signal
ax_emg.set_ylabel('Voltage (V)')
ax_emg.set_xlabel('Samples')
line_raw_emg, = ax_emg.plot([], [], color='gray', label='Raw EMG', alpha=0.5)
line_env_emg, = ax_emg.plot([], [], color='red', linewidth=2, label='Envelope')
ax_emg.legend(loc='upper right')
ax_emg.grid(True)

def update_plot(frame):
    global imu_sample_count, emg_sample_count
    
    # Process IMU Queue
    while not imu_queue.empty():
        line = imu_queue.get()
        if line:
            try:
                roll, pitch, yaw, ax, ay, az = map(float, line.split(','))
                t_imu.append(imu_sample_count)
                roll_data.append(roll)
                pitch_data.append(pitch)
                yaw_data.append(yaw)
                ax_data.append(ax)
                ay_data.append(ay)
                az_data.append(az)
                imu_sample_count += 1
            except ValueError:
                pass 

    # Process EMG Queue
    while not emg_queue.empty():
        line = emg_queue.get()
        if line:
            try:
                v_raw, v_env = map(float, line.split(','))
                t_emg.append(emg_sample_count)
                raw_emg_data.append(v_raw)
                env_emg_data.append(v_env)
                emg_sample_count += 1
            except ValueError:
                pass 

    # Update IMU Plots
    if len(t_imu) > 0:
        line_roll.set_data(t_imu, roll_data)
        line_pitch.set_data(t_imu, pitch_data)
        line_yaw.set_data(t_imu, yaw_data)
        
        line_ax.set_data(t_imu, ax_data)
        line_ay.set_data(t_imu, ay_data)
        line_az.set_data(t_imu, az_data)
        
        for axis in (ax_ori, ax_acc):
            axis.set_xlim(max(0, imu_sample_count - MAX_POINTS_IMU), max(MAX_POINTS_IMU, imu_sample_count))
            axis.relim()
            axis.autoscale_view(scaley=True, scalex=False)

    # Update EMG Plot
    if len(t_emg) > 0:
        line_raw_emg.set_data(t_emg, raw_emg_data)
        line_env_emg.set_data(t_emg, env_emg_data)
        
        ax_emg.set_xlim(max(0, emg_sample_count - MAX_POINTS_EMG), max(MAX_POINTS_EMG, emg_sample_count))
        ax_emg.relim()
        ax_emg.autoscale_view(scaley=True, scalex=False)

    return line_roll, line_pitch, line_yaw, line_ax, line_ay, line_az, line_raw_emg, line_env_emg

# --- Run Animation ---
ani = animation.FuncAnimation(fig, update_plot, interval=20, blit=False, cache_frame_data=False)

try:
    plt.tight_layout()
    plt.show()
except KeyboardInterrupt:
    print("Plot closed by user.")