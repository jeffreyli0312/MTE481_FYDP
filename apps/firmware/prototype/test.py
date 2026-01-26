import serial
import numpy as np
import pyqtgraph as pg
import pyqtgraph.opengl as gl
from pyqtgraph.Qt import QtCore, QtWidgets
import sys
import csv
import time
from datetime import datetime

# ---------------- Config: lock rotation axis ----------------
# Choose one: 'roll', 'pitch', 'yaw'
LOCK_AXIS = 'yaw'

# ---------------- Serial Setup ----------------
# windows 
ser = serial.Serial('COM3', 115200, timeout=1)  # <-- change COM port

# macbook
# ser = serial.Serial('/dev/tty.usbmodem101', 115200, timeout=1)  # <-- change COM port

# ---------------- CSV Setup ----------------
csv_filename = f"yaw_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
csv_file = open(csv_filename, 'w', newline='')
csv_writer = csv.writer(csv_file)
csv_writer.writerow(['time', 'yaw_deg'])  # Header row
start_time = time.time()  # Reference time for relative timestamps
print(f"Saving data to {csv_filename}")

# ---------------- PyQtGraph 3D Setup ----------------
app = QtWidgets.QApplication([])

w = gl.GLViewWidget()
w.show()
w.setWindowTitle('IMU 3D Cube')
w.setCameraPosition(distance=400)
w.opts['backgroundColor'] = (1, 1, 1, 1)  # White background (0–1 floats)
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
cube = gl.GLMeshItem(
    meshdata=cube_mesh,
    color=(1,0,0,0.5),
    smooth=False,
    drawEdges=True,
    edgeColor=(0,0,0,1)
)
cube.scale(50,50,50)
w.addItem(cube)

# ---------------- Coordinate Arrows ----------------
def add_arrow(origin, direction, color=(0,0,0,1), length=100):
    direction = np.array(direction, dtype=float)
    direction = direction / np.linalg.norm(direction) * length
    line = gl.GLLinePlotItem(
        pos=np.array([origin, origin+direction]),
        color=color,
        width=2,
        antialias=True
    )
    w.addItem(line)
    cone_mesh = gl.MeshData.cylinder(rows=10, cols=20, radius=[0.0, 5], length=15)
    cone = gl.GLMeshItem(meshdata=cone_mesh, color=color, smooth=True, drawEdges=False)
    cone.translate(*(origin+direction))
    w.addItem(cone)

add_arrow([0,0,0],[1,0,0], color=(1,0,0,1))
add_arrow([0,0,0],[0,1,0], color=(0,1,0,1))
add_arrow([0,0,0],[0,0,1], color=(0,0,1,1))

# ---------------- Yaw Reference ----------------
ref_yaw = None  # used when LOCK_AXIS == 'yaw' to show yaw relative to startup

# ---------------- Update Function ----------------
def update():
    global cube, ref_yaw

    try:
        # Clear any old data in the buffer to get the latest reading
        # ser.reset_input_buffer()
        
        line = ser.readline().decode('ascii', errors='ignore').strip()
        print(line)
        if not line:
            return

        parts = line.split(',')
        if len(parts) != 3:
            return

        # Parse Arduino values
        roll_deg, pitch_deg, yaw_deg = [float(x) for x in parts]

        # Yaw-only mode
        if ref_yaw is None:
            ref_yaw = yaw_deg
            # return

        yaw_rel = yaw_deg - ref_yaw
        yaw_rel = (yaw_rel + 180) % 360 - 180
        yaw_deg = -yaw_rel

        # Log to CSV with timestamp
        elapsed_time = time.time() - start_time
        csv_writer.writerow([elapsed_time, yaw_deg])
        csv_file.flush()  # Ensure data is written immediately

        # Apply ONLY yaw rotation
        cube.resetTransform()
        cube.scale(50,50,50)
        cube.rotate(yaw_deg, 0,0,1)
        # print(yaw_deg)

    except:
        pass


# ---------------- Timer ----------------
timer = QtCore.QTimer()
timer.timeout.connect(update)
timer.start(10)

# ---------------- Cleanup Function ----------------
def cleanup():
    csv_file.close()
    ser.close()
    print(f"\nData saved to {csv_filename}")
    print(f"Total duration: {time.time() - start_time:.2f} seconds")

app.aboutToQuit.connect(cleanup)

# ---------------- Run ----------------
try:
    if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
        QtWidgets.QApplication.instance().exec_()
finally:
    cleanup()
