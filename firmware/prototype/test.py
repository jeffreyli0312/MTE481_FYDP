import serial
import numpy as np
import pyqtgraph as pg
import pyqtgraph.opengl as gl
from pyqtgraph.Qt import QtCore, QtWidgets
import sys
import time

# ---------------- Serial Setup ----------------
# Arduino must output: roll,pitch,yaw,ax,ay,az\n
#   roll,pitch,yaw in degrees
#   ax,ay,az in m/s^2 (sensor frame, including gravity)
try:
    ser = serial.Serial('COM3', 115200, timeout=1)  # <-- change for your system
    print("Serial connection established on COM3")
except serial.SerialException as e:
    print("Error: Could not open serial port COM3. Make sure:")
    print("  1. Arduino is connected and streaming roll,pitch,yaw,ax,ay,az")
    print("  2. COM port is correct (currently set to COM3)")
    print("  3. No other program is using the serial port")
    print(f"Error details: {e}")
    sys.exit(1)

# ---------------- State / Reference ----------------
ref_angles = None          # (roll0, pitch0, yaw0) in degrees
pos = np.zeros(3)          # [x, y, z] position in meters (world frame)
vel = np.zeros(3)          # [vx, vy, vz] velocity in m/s (world frame)
last_time = None           # for dt

g = 9.81                   # gravity (m/s^2)

# ---------------- PyQtGraph 3D Setup ----------------
app = QtWidgets.QApplication([])

w = gl.GLViewWidget()
w.show()
w.setWindowTitle('IMU 3D Cube')
w.setCameraPosition(distance=400)
w.opts['backgroundColor'] = (1, 1, 1, 1)
w.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Expanding)

# ---------------- Cube Mesh ----------------
verts = np.array([
    [-0.5, -0.5, -0.5],
    [-0.5, -0.5,  0.5],
    [-0.5,  0.5, -0.5],
    [-0.5,  0.5,  0.5],
    [ 0.5, -0.5, -0.5],
    [ 0.5, -0.5,  0.5],
    [ 0.5,  0.5, -0.5],
    [ 0.5,  0.5,  0.5]
], dtype=float)

faces = np.array([
    [0,1,2],[1,3,2],
    [4,6,5],[5,6,7],
    [0,4,1],[1,4,5],
    [2,3,6],[3,7,6],
    [0,2,4],[2,6,4],
    [1,5,3],[3,5,7]
], dtype=int)

cube_mesh = gl.MeshData(vertexes=verts, faces=faces)
cube = gl.GLMeshItem(meshdata=cube_mesh, color=(1,0,0,0.5),
                     smooth=False, drawEdges=True, edgeColor=(0,0,0,1))
cube.scale(50, 50, 50)
w.addItem(cube)

# ---------------- Coordinate Arrows ----------------
def add_arrow(origin, direction, color=(0,0,0,1), length=100):
    direction = np.array(direction, dtype=float)
    n = np.linalg.norm(direction)
    if n == 0:
        return
    direction = direction / n * length

    line = gl.GLLinePlotItem(
        pos=np.array([origin, origin + direction]),
        color=color,
        width=2,
        antialias=True
    )
    w.addItem(line)

    cone_mesh = gl.MeshData.cylinder(rows=10, cols=20,
                                     radius=[0.0, 5], length=15)
    cone = gl.GLMeshItem(meshdata=cone_mesh, color=color,
                         smooth=True, drawEdges=False)
    cone.translate(*(origin + direction))
    w.addItem(cone)

add_arrow([0,0,0],[1,0,0], color=(1,0,0,1))  # X
add_arrow([0,0,0],[0,1,0], color=(0,1,0,1))  # Y
add_arrow([0,0,0],[0,0,1], color=(0,0,1,1))  # Z

# ---------------- Helper: Rotation Matrix ----------------
def rpy_to_rotmat(roll_deg, pitch_deg, yaw_deg):
    """Return rotation matrix R (body->world) using Z-Y-X (yaw-pitch-roll) convention."""
    r = np.radians(roll_deg)
    p = np.radians(pitch_deg)
    y = np.radians(yaw_deg)

    cr, sr = np.cos(r), np.sin(r)
    cp, sp = np.cos(p), np.sin(p)
    cy, sy = np.cos(y), np.sin(y)

    # Body -> world rotation (aerospace Z-Y-X)
    R = np.array([
        [cy*cp, cy*sp*sr - sy*cr, cy*sp*cr + sy*sr],
        [sy*cp, sy*sp*sr + cy*cr, sy*sp*cr - cy*sr],
        [-sp,   cp*sr,            cp*cr]
    ])
    return R

# ---------------- Update Function ----------------
def update():
    global cube, ref_angles, pos, vel, last_time

    try:
        line = ser.readline().decode('ascii', errors='ignore').strip()
        if not line:
            return

        parts = line.split(',')
        if len(parts) != 6:
            return

        roll_deg, pitch_deg, yaw_deg, ax, ay, az = map(float, parts)

        # First valid sample: set reference orientation & initial state
        if ref_angles is None:
            ref_angles = (roll_deg, pitch_deg, yaw_deg)
            pos[:] = 0.0
            vel[:] = 0.0
            last_time = time.perf_counter()
            print(f"Reference set at orientation (deg): "
                  f"({roll_deg:.2f}, {pitch_deg:.2f}, {yaw_deg:.2f})")
            print("Position reference set to (0, 0, 0) m")
            return

        # Time step
        now = time.perf_counter()
        if last_time is None:
            last_time = now
            return
        dt = now - last_time
        last_time = now

        if dt <= 0 or dt > 0.5:
            # Skip unreasonable dt to avoid huge jumps
            return

        # -------- Orientation for visualization (relative to reference) --------
        d_roll = roll_deg - ref_angles[0]
        d_pitch = pitch_deg - ref_angles[1]
        d_yaw = yaw_deg - ref_angles[2]

        # -------- Position Estimation (very drift-prone in practice!) --------
        # 1. Rotate accel from body frame to world frame
        R = rpy_to_rotmat(roll_deg, pitch_deg, yaw_deg)
        a_body = np.array([ax, ay, az])

        # 2. Transform to world frame
        a_world = R @ a_body

        # 3. Remove gravity (assume +Z is up)
        a_world[2] -= g

        # 4. Integrate to get velocity and position
        vel += a_world * dt
        pos += vel * dt

        # -------- Outputs --------
        # Print translational position relative to start
        print(f"Relative position [x, y, z] (m): "
              f"({pos[0]:.3f}, {pos[1]:.3f}, {pos[2]:.3f})")

        # Update cube orientation (still relative to initial orientation)
        cube.resetTransform()
        cube.scale(50, 50, 50)
        cube.rotate(d_roll, 1, 0, 0)
        cube.rotate(d_pitch, 0, 1, 0)
        cube.rotate(d_yaw, 0, 0, 1)

    except Exception:
        # Ignore malformed lines / parse errors
        pass

# ---------------- Timer ----------------
timer = QtCore.QTimer()
timer.timeout.connect(update)
timer.start(30)  # ~33 Hz

# ---------------- Run ----------------
if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
    QtWidgets.QApplication.instance().exec_()
