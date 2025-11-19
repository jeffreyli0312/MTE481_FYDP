import pandas as pd
import matplotlib.pyplot as plt

# df = pd.read_csv('90deg_test_10_times.csv')
# df = pd.read_csv('5.csv')
df = pd.read_csv('7.csv')
plt.plot(df['time'], df['yaw_deg'])
plt.xlabel('Time (seconds)')
plt.ylabel('Yaw Angle (degrees)')
plt.title('IMU Yaw Data')
plt.grid(True)
plt.show()