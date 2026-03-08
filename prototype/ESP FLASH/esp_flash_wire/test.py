import serial
import time
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from collections import deque
from scipy.signal import find_peaks, welch
from scipy.integrate import trapezoid as trapz
from scipy.integrate import cumulative_trapezoid

# ==============================================================================
# CONFIGURATION
# ==============================================================================
SERIAL_PORT = '/dev/cu.usbserial-0001'  # Change to your active port
BAUD_RATE = 115200
MAX_POINTS = 150
SAMPLING_RATE = 100  # Based on the 10ms transmission delay in the ESP32 code

# Form & Calibration Thresholds
FLARE_THRESHOLD = 15.0      # Degrees of yaw deviation
CALIBRATION_TIME = 3.0      # Seconds to establish Maximum Voluntary Contraction (MVC)
FLEX_THRESHOLD_IEMG = 0.5   # V*s area under curve to count as "Intentional Flex"
MIN_ROM_THRESHOLD = 90.0    # Minimum angular displacement for a full rep (Degrees)
TREMOR_THRESHOLD = 0.2      # Variance in acceleration magnitude (g^2)

# ==============================================================================
# ADVANCED ANALYTICS HELPER FUNCTIONS
# ==============================================================================
def analyze_rom(angle_array, start_idx, end_idx, min_rom_threshold):
    rep_angles = angle_array[start_idx:end_idx]
    rom = np.max(rep_angles) - np.min(rep_angles)
    is_half_rep = rom < min_rom_threshold
    return rom, is_half_rep

def analyze_tempo_tut(t_array, start_idx, conc_peak_idx, ecc_peak_idx, end_idx):
    concentric_time = t_array[conc_peak_idx] - t_array[start_idx]
    eccentric_time = t_array[end_idx] - t_array[conc_peak_idx]
    rep_tut = t_array[end_idx] - t_array[start_idx]
    return concentric_time, eccentric_time, rep_tut

def analyze_stability(ax, ay, az, start_idx, end_idx, tremor_threshold):
    accel_mag = np.sqrt(np.array(ax[start_idx:end_idx])**2 + 
                        np.array(ay[start_idx:end_idx])**2 + 
                        np.array(az[start_idx:end_idx])**2)
    stability_variance = np.var(accel_mag)
    has_tremor = stability_variance > tremor_threshold
    return stability_variance, has_tremor

def analyze_emd(t_array, emg_array, ax, ay, az, start_idx, end_idx):
    rep_t = t_array[start_idx:end_idx]
    rep_emg = emg_array[start_idx:end_idx]
    accel_mag = np.sqrt(np.array(ax[start_idx:end_idx])**2 + 
                        np.array(ay[start_idx:end_idx])**2 + 
                        np.array(az[start_idx:end_idx])**2)
    
    baseline_emg = np.mean(rep_emg[:5]) + 5.0 # +5% MVC threshold
    baseline_accel = np.mean(accel_mag[:5])
    
    emg_fire_idx = np.where(rep_emg > baseline_emg)[0]
    accel_fire_idx = np.where(np.abs(accel_mag - baseline_accel) > 0.05)[0] # 0.05g deviation
    
    if len(emg_fire_idx) > 0 and len(accel_fire_idx) > 0:
        t_emg_onset = rep_t[emg_fire_idx[0]]
        t_accel_onset = rep_t[accel_fire_idx[0]]
        emd_ms = (t_accel_onset - t_emg_onset) * 1000.0
        return max(0, emd_ms)
    return None

def calculate_mdf(raw_data, fs):
    freqs, psd = welch(raw_data, fs, nperseg=128)
    cumulative_power = np.cumsum(psd)
    mdf_index = np.where(cumulative_power >= cumulative_power[-1] / 2)[0][0]
    return freqs[mdf_index]

def analyze_sticking_point(t_array, angle_array, emg_array, start_idx, conc_peak_idx):
    t_conc = t_array[start_idx:conc_peak_idx]
    angle_conc = angle_array[start_idx:conc_peak_idx]
    emg_conc = emg_array[start_idx:conc_peak_idx]
    
    if len(t_conc) < 5:
        return None
        
    dt = np.gradient(t_conc)
    dt[dt == 0] = 1e-6 
    angular_velocity = np.abs(np.gradient(angle_conc, t_conc))
    
    window = min(5, len(angular_velocity) // 2)
    if window > 0:
        angular_velocity = np.convolve(angular_velocity, np.ones(window)/window, mode='same')
        
    angular_velocity[angular_velocity < 1.0] = 1.0 
    
    trim = max(1, int(len(emg_conc) * 0.15))
    search_emg = emg_conc[trim:-trim]
    search_vel = angular_velocity[trim:-trim]
    search_angle = angle_conc[trim:-trim]
    
    if len(search_emg) == 0:
        return None
        
    sticking_metric = search_emg / search_vel
    local_stick_idx = np.argmax(sticking_metric)
    return search_angle[local_stick_idx]

def analyze_vbt(t_array, ax, ay, az, start_idx, conc_peak_idx):
    t_conc = t_array[start_idx:conc_peak_idx]
    if len(t_conc) < 2:
        return 0.0, 0.0
        
    ax_conc = np.array(ax[start_idx:conc_peak_idx])
    ay_conc = np.array(ay[start_idx:conc_peak_idx])
    az_conc = np.array(az[start_idx:conc_peak_idx])
    
    accel_mag_g = np.sqrt(ax_conc**2 + ay_conc**2 + az_conc**2)
    dynamic_accel_ms2 = (accel_mag_g - 1.0) * 9.81
    dynamic_accel_ms2[dynamic_accel_ms2 < 0] = 0 
    
    velocity_ms = cumulative_trapezoid(dynamic_accel_ms2, t_conc, initial=0)
    peak_velocity = np.max(velocity_ms)
    
    percent_1rm = 111.0 - (77.0 * peak_velocity)
    percent_1rm = max(0.0, min(percent_1rm, 100.0))
    
    return peak_velocity, percent_1rm

# ==============================================================================
# GLOBAL VARIABLES & BUFFERS
# ==============================================================================
start_time = None
is_calibrating = True
mvc_value = 0.01  
baseline_yaw = None
sample_count = 0

# Live Plot Buffers (Rolling window)
t_data = deque(maxlen=MAX_POINTS)
roll_data, pitch_data, yaw_data = deque(maxlen=MAX_POINTS), deque(maxlen=MAX_POINTS), deque(maxlen=MAX_POINTS)
ax_data, ay_data, az_data = deque(maxlen=MAX_POINTS), deque(maxlen=MAX_POINTS), deque(maxlen=MAX_POINTS)
norm_env_data = deque(maxlen=MAX_POINTS) 

# Full Session Recording Buffers (For Post-Processing)
full_t = []
full_roll, full_pitch, full_yaw = [], [], []
full_ax, full_ay, full_az = [], [], []
full_raw_emg, full_env_emg, full_norm_emg = [], [], []

# ==============================================================================
# LIVE DASHBOARD SETUP
# ==============================================================================
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0.01)
    ser.reset_input_buffer()
    print(f"Connected to {SERIAL_PORT}")
    print("\n--- CALIBRATION STARTING ---")
    print(f"Assume proper starting form and FLEX your target muscle for {CALIBRATION_TIME} seconds!")
except Exception as e:
    print(f"Failed to connect. Error: {e}")
    exit()

fig, (ax_ori, ax_acc, ax_emg) = plt.subplots(3, 1, figsize=(10, 10), sharex=True)
fig.suptitle('Live FYDP Telemetry: Kinematics & Muscle Activation', fontsize=16)

# 1. Orientation
ax_ori.set_ylabel('Angle (°)')
line_roll, = ax_ori.plot([], [], label='Roll', color='blue')
line_pitch, = ax_ori.plot([], [], label='Pitch', color='red')
line_yaw, = ax_ori.plot([], [], label='Yaw', color='green')
flare_alert_text = ax_ori.text(0.02, 0.85, '', transform=ax_ori.transAxes, color='red', fontweight='bold')
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
ax_emg.set_ylabel('Activation (% MVC)')
ax_emg.set_xlabel('Samples')
ax_emg.set_ylim(0, 110)
line_env_emg, = ax_emg.plot([], [], color='red', linewidth=2, label='% MVC Envelope')
calib_status_text = ax_emg.text(0.02, 0.85, 'CALIBRATING...', transform=ax_emg.transAxes, color='orange', fontweight='bold')
ax_emg.legend(loc='upper right')
ax_emg.grid(True)

def update_plot(frame):
    global sample_count, start_time, is_calibrating, mvc_value, baseline_yaw
    
    if start_time is None:
        start_time = time.time()
        
    while ser.in_waiting > 0:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if line:
            try:
                roll, pitch, yaw, ax, ay, az, v_raw, v_env = map(float, line.split(','))
                
                # --- MVC Calibration ---
                if is_calibrating:
                    elapsed = time.time() - start_time
                    if v_env > mvc_value:
                        mvc_value = v_env 
                    
                    if elapsed > CALIBRATION_TIME:
                        is_calibrating = False
                        calib_status_text.set_text(f'LIVE (MVC: {mvc_value:.2f}V)')
                        calib_status_text.set_color('green')
                        print("--- CALIBRATION COMPLETE. BEGIN SET. ---")
                
                normalized_activation = min((v_env / mvc_value) * 100, 100.0)

                # --- Shoulder Flare Detection ---
                if baseline_yaw is None and not is_calibrating:
                    baseline_yaw = yaw
                
                if baseline_yaw is not None:
                    deviation = abs(yaw - baseline_yaw)
                    deviation = 360 - deviation if deviation > 180 else deviation
                    if deviation > FLARE_THRESHOLD:
                        flare_alert_text.set_text(f"⚠️ SHOULDER FLARE! ({deviation:.1f}°)")
                    else:
                        flare_alert_text.set_text('')

                # --- Update Live Buffers ---
                t_data.append(sample_count)
                roll_data.append(roll); pitch_data.append(pitch); yaw_data.append(yaw)
                ax_data.append(ax); ay_data.append(ay); az_data.append(az)
                norm_env_data.append(normalized_activation)
                
                # --- Save to Full Session History ---
                full_t.append(sample_count / SAMPLING_RATE)
                full_roll.append(roll); full_pitch.append(pitch); full_yaw.append(yaw)
                full_ax.append(ax); full_ay.append(ay); full_az.append(az)
                full_raw_emg.append(v_raw)
                full_env_emg.append(v_env)
                full_norm_emg.append(normalized_activation)
                
                sample_count += 1
            except ValueError:
                pass 

    # Update GUI lines
    if len(t_data) > 0:
        line_roll.set_data(t_data, roll_data)
        line_pitch.set_data(t_data, pitch_data)
        line_yaw.set_data(t_data, yaw_data)
        line_ax.set_data(t_data, ax_data)
        line_ay.set_data(t_data, ay_data)
        line_az.set_data(t_data, az_data)
        line_env_emg.set_data(t_data, norm_env_data)
        
        for axis in (ax_ori, ax_acc):
            axis.set_xlim(max(0, sample_count - MAX_POINTS), max(MAX_POINTS, sample_count))
            axis.relim()
            axis.autoscale_view(scaley=True, scalex=False)
        ax_emg.set_xlim(max(0, sample_count - MAX_POINTS), max(MAX_POINTS, sample_count))

    return line_roll, line_pitch, line_yaw, line_ax, line_ay, line_az, line_env_emg, calib_status_text, flare_alert_text

ani = animation.FuncAnimation(fig, update_plot, interval=20, blit=False, cache_frame_data=False)

try:
    plt.tight_layout()
    plt.show()  
except KeyboardInterrupt:
    pass
finally:
    ser.close()
    print("\n--- LIVE SESSION ENDED. STARTING POST-PROCESSING ---")

# ==============================================================================
# POST-WORKOUT ANALYTICS
# ==============================================================================
if len(full_norm_emg) > 100:
    t_arr = np.array(full_t)
    env_arr = np.array(full_norm_emg)
    raw_arr = np.array(full_raw_emg)
    pitch_arr = np.array(full_pitch) 
    ax_arr, ay_arr, az_arr = np.array(full_ax), np.array(full_ay), np.array(full_az)

    # 1. Phase Detection
    min_activation = 15.0 # 15% MVC
    peaks, _ = find_peaks(env_arr, height=min_activation, distance=SAMPLING_RATE)
    
    concentric_peaks, eccentric_peaks = [], []
    i = 0
    while i < len(peaks) - 1:
        time_diff = t_arr[peaks[i + 1]] - t_arr[peaks[i]]
        if time_diff <= 4.0: 
            concentric_peaks.append(peaks[i])
            eccentric_peaks.append(peaks[i + 1])
            i += 2
        else:
            i += 1

    print(f"\n[Analytics] Detected {len(concentric_peaks)} complete repetitions.")
    print("\n[Analytics] Advanced Biomechanical Breakdown:")
    
    total_tut = 0.0

    # 2. Iterate through Repetitions
    for rep in range(len(concentric_peaks)):
        conc_peak = concentric_peaks[rep]
        ecc_peak = eccentric_peaks[rep]
        
        start = max(0, conc_peak - int(SAMPLING_RATE * 1.0))
        end = min(len(t_arr) - 1, ecc_peak + int(SAMPLING_RATE * 1.0))
        
        # Exertion (iEMG)
        t_rep = t_arr[start:end]
        emg_rep = env_arr[start:end]
        iemg = trapz(emg_rep, t_rep)
        peak_act = np.max(emg_rep)
        classification = "Intentional Flex" if iemg >= FLEX_THRESHOLD_IEMG else "Standard Exertion"

        # ROM (Assuming Pitch tracks the arm angle for a curl/press)
        rom_deg, is_half_rep = analyze_rom(pitch_arr, start, end, MIN_ROM_THRESHOLD)
        rom_status = "⚠️ HALF-REP" if is_half_rep else "Full ROM"
        
        # Tempo & TUT
        t_conc, t_ecc, rep_tut = analyze_tempo_tut(t_arr, start, conc_peak, ecc_peak, end)
        total_tut += rep_tut
        
        # Sticking Point Locator
        sticking_angle = analyze_sticking_point(t_arr, pitch_arr, env_arr, start, conc_peak)
        sticking_display = f"{sticking_angle:.1f}°" if sticking_angle is not None else "N/A"
        
        # Velocity-Based Training (VBT) & 1RM Prediction
        peak_vel, percent_1rm = analyze_vbt(t_arr, ax_arr, ay_arr, az_arr, start, conc_peak)
        
        # Kinematic Stability
        variance, has_tremor = analyze_stability(ax_arr, ay_arr, az_arr, start, end, TREMOR_THRESHOLD)
        stability_status = "⚠️ TREMOR DETECTED" if has_tremor else "Stable"
        
        # Electromechanical Delay (EMD)
        emd_ms = analyze_emd(t_arr, env_arr, ax_arr, ay_arr, az_arr, start, end)
        emd_display = f"{emd_ms:.1f} ms" if emd_ms is not None else "N/A"
        
        print(f"\n--- Rep {rep+1} ---")
        print(f"  Exertion:  Peak = {peak_act:.1f}% | iEMG = {iemg:.1f} ({classification})")
        print(f"  ROM:       {rom_deg:.1f}° ({rom_status})")
        print(f"  Tempo:     Up {t_conc:.1f}s | Down {t_ecc:.1f}s")
        print(f"  Velocity:  {peak_vel:.2f} m/s (Estimated {percent_1rm:.1f}% of 1RM)")
        print(f"  Sticking:  Stalled at {sticking_display}")
        print(f"  Stability: Var={variance:.3f}g^2 ({stability_status})")
        print(f"  EMD:       {emd_display}")

    print(f"\n[Analytics] Total Time Under Tension (TUT): {total_tut:.1f} seconds")

    # 3. Muscle Fatigue Tracking (Frequency Domain)
    if len(concentric_peaks) >= 2:
        rep1_start = max(0, concentric_peaks[0] - int(SAMPLING_RATE * 1.5))
        rep1_end = min(len(raw_arr), eccentric_peaks[0] + int(SAMPLING_RATE * 1.5))
        last_rep_start = max(0, concentric_peaks[-1] - int(SAMPLING_RATE * 1.5))
        last_rep_end = min(len(raw_arr), eccentric_peaks[-1] + int(SAMPLING_RATE * 1.5))

        mdf_fresh = calculate_mdf(raw_arr[rep1_start:rep1_end], SAMPLING_RATE)
        mdf_fatigued = calculate_mdf(raw_arr[last_rep_start:last_rep_end], SAMPLING_RATE)

        print(f"\n[Analytics] Fatigue Tracking:")
        print(f"  Rep 1 MDF:    {mdf_fresh:.2f} Hz")
        print(f"  Last Rep MDF: {mdf_fatigued:.2f} Hz")
        print(f"  MDF Shift:    {mdf_fatigued - mdf_fresh:.2f} Hz")
        
    print("\n--- DONE ---")
else:
    print("Not enough data recorded for post-processing analytics.")