import pandas as pd
import matplotlib.pyplot as plt

# df = pd.read_csv('90deg_test_10_times.csv')
# df = pd.read_csv('5.csv')
# df = pd.read_csv('8.csv') # bicep teset 1
# df = pd.read_csv('10.csv') # bicep teset 2
# df = pd.read_csv('11.csv') # bicep teset 3
# df = pd.read_csv('12.csv') # bicep teset 4, against the wall
df = pd.read_csv('13.csv') # bicep teset 5, against the wall + pushing up movement
plt.plot(df['time'], df['yaw_deg'])
plt.xlabel('Time (seconds)')
plt.ylabel('Yaw Angle (degrees)')
plt.title('IMU Yaw Data')
plt.grid(True)
plt.show()