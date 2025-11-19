import serial
import numpy as np
import pyqtgraph as pg
import pyqtgraph.opengl as gl
from pyqtgraph.Qt import QtCore, QtWidgets
import sys

# ---------------- Config: lock rotation axis ----------------
# Choose one: 'roll', 'pitch', 'yaw'
LOCK_AXIS = 'yaw'

# ---------------- Serial Setup ----------------
# windows 
ser = serial.Serial('COM3', 115200, timeout=1)  # <-- change COM port

# macbook
# ser = serial.Serial('/dev/tty.usbmodem101', 9600, timeout=1)  # <-- change COM port

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
        line = ser.readline().decode('ascii', errors='ignore').strip()
        if not line:
            return

        parts = line.split(',')
        if len(parts) != 3:
            return

        roll_deg, pitch_deg, yaw_deg = [float(x) for x in parts]

        # Lock / process axes
        if LOCK_AXIS == 'roll':
            pitch_deg = 0.0
            yaw_deg = 0.0

        elif LOCK_AXIS == 'pitch':
            roll_deg = 0.0
            yaw_deg = 0.0

        elif LOCK_AXIS == 'yaw':
            # Only yaw is used; show yaw relative to initial yaw
            roll_deg = 0.0
            pitch_deg = 0.0
            if ref_yaw is None:
                ref_yaw = yaw_deg
                print(f"Yaw reference set to {ref_yaw:.2f} deg")
                return

            # Yaw relative to reference
            yaw_rel = yaw_deg - ref_yaw

            # Wrap to [-180, 180] for nicer display
            if yaw_rel > 180:
                yaw_rel -= 360
            elif yaw_rel < -180:
                yaw_rel += 360

            # Flip sign so visual & printed direction match your physical rotation
            yaw_rel = -yaw_rel

            # Print current yaw relative to 0-position
            print(f"Yaw (relative): {yaw_rel:.2f} deg")

            # Use relative yaw (with flipped sign) for visualization
            yaw_deg = yaw_rel

        # Reset and rotate cube with processed angles
        cube.resetTransform()
        cube.scale(50,50,50)
        cube.rotate(roll_deg, 1,0,0)
        cube.rotate(pitch_deg, 0,1,0)
        cube.rotate(yaw_deg, 0,0,1)

    except Exception:
        # Ignore malformed lines / parse errors
        pass

# ---------------- Timer ----------------
timer = QtCore.QTimer()
timer.timeout.connect(update)
timer.start(30)

# ---------------- Run ----------------
if (sys.flags.interactive != 1) or not hasattr(QtCore, 'PYQT_VERSION'):
    QtWidgets.QApplication.instance().exec_()
