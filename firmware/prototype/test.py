import serial
import numpy as np
import pyqtgraph as pg
import pyqtgraph.opengl as gl
from pyqtgraph.Qt import QtCore, QtWidgets
import sys

# ---------------- Serial Setup ----------------
# NOTE: This requires the Arduino to be connected and have the IMU code (imu.cpp) flashed onto it.
# The Arduino should be outputting roll,pitch,yaw data in the format: "roll,pitch,yaw\n"
try:
    ser = serial.Serial('COM3', 115200, timeout=1)  # <-- change COM port (baud rate matches imu.cpp)
    print("Serial connection established on COM3")
except serial.SerialException as e:
    print(f"Error: Could not open serial port COM3. Make sure:")
    print(f"  1. Arduino is connected and has the IMU code (imu.cpp) flashed")
    print(f"  2. COM port is correct (currently set to COM3)")
    print(f"  3. No other program is using the serial port")
    print(f"Error details: {e}")
    sys.exit(1)

# ---------------- PyQtGraph 3D Setup ----------------
app = QtWidgets.QApplication([])

w = gl.GLViewWidget()
w.show()
w.setWindowTitle('IMU 3D Cube')
w.setCameraPosition(distance=400)
w.opts['backgroundColor'] = (1, 1, 1, 1)  # White background (0–1 floats)
w.setSizePolicy(QtWidgets.QSizePolicy.Expanding, QtWidgets.QSizePolicy.Expanding)

# ---------------- Cube Mesh ----------------
# Vertices and faces manually defined
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
cube = gl.GLMeshItem(meshdata=cube_mesh, color=(1,0,0,0.5), smooth=False, drawEdges=True, edgeColor=(0,0,0,1))
cube.scale(50,50,50)
w.addItem(cube)

# ---------------- Coordinate Arrows ----------------
def add_arrow(origin, direction, color=(0,0,0,1), length=100):
    """Draw an arrow as a line + small cone at the tip"""
    direction = np.array(direction)
    direction = direction / np.linalg.norm(direction) * length
    line = gl.GLLinePlotItem(pos=np.array([origin, origin+direction]), color=color, width=2, antialias=True)
    w.addItem(line)
    # cone tip
    cone_mesh = gl.MeshData.cylinder(rows=10, cols=20, radius=[0.0, 5], length=15)
    cone = gl.GLMeshItem(meshdata=cone_mesh, color=color, smooth=True, drawEdges=False)
    cone.translate(*(origin+direction))
    w.addItem(cone)

# X, Y, Z arrows
add_arrow([0,0,0],[1,0,0], color=(1,0,0,1))
add_arrow([0,0,0],[0,1,0], color=(0,1,0,1))
add_arrow([0,0,0],[0,0,1], color=(0,0,1,1))

# ---------------- Update Function ----------------
def update():
    global cube
    try:
        line = ser.readline().decode('ascii').strip()
        if not line:
            return
        roll, pitch, yaw = [float(x) for x in line.split(',')]

        # Convert to radians
        roll = np.radians(roll)
        pitch = np.radians(pitch)
        yaw = np.radians(yaw)

        # Reset and rotate cube
        cube.resetTransform()
        cube.scale(50,50,50)
        cube.rotate(np.degrees(roll), 1,0,0)
        cube.rotate(np.degrees(pitch), 0,1,0)
        cube.rotate(np.degrees(yaw), 0,0,1)
    except:
        pass

# ---------------- Timer ----------------
timer = QtCore.QTimer()
timer.timeout.connect(update)
timer.start(30)  # update ~33 Hz

# ---------------- Run ----------------
if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
    QtWidgets.QApplication.instance().exec_()
