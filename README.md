# MTE481 Final Year Design Project

This repository contains the complete codebase for a Final Year Design Project at the University of Waterloo. The project implements a wireless sensor data collection and visualization system using on-body sensors (EMG and IMU) connected to an ESP32 microcontroller, which communicates with a mobile application via Bluetooth Low Energy (BLE).

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Hardware Requirements](#hardware-requirements)
- [Software Requirements](#software-requirements)
- [Getting Started](#getting-started)
  - [Firmware Setup](#firmware-setup)
  - [Mobile App Setup](#mobile-app-setup)
- [Usage](#usage)
- [Data Collection](#data-collection)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

This project enables real-time collection and visualization of physiological and motion data from wearable sensors. The system consists of:

- **Embedded Firmware**: ESP32-based firmware that interfaces with EMG (Electromyography) and IMU (Inertial Measurement Unit) sensors
- **Mobile Application**: Cross-platform iOS/Android app built with React Native and Expo for data visualization and management
- **Wireless Communication**: BLE (Bluetooth Low Energy) protocol for real-time data streaming
- **Data Storage**: Local SQLite database and optional cloud storage via Supabase

## 🏗️ Architecture

The system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────┐
│                    On-body Sensors                       │
│              (EMG, IMU - 9DoF IMU)                       │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              ESP32 Firmware Layer                        │
│         (Arduino/PlatformIO Framework)                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                   BLE Link
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Mobile Application (iOS/Android)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  BLE Layer   │  │ Data Storage │  │  UI Layer    │  │
│  │ (react-native│  │   (SQLite)   │  │ (React Native│  │
│  │   -ble-plx)  │  │              │  │  + Expo)     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

For a detailed architecture diagram, see [`docs/software_arch_diagram/architecture.txt`](docs/software_arch_diagram/architecture.txt).

## 📁 Project Structure

```
MTE481_FYDP/
├── apps/
│   ├── firmware/              # ESP32 firmware code
│   │   └── prototype/         # Prototype implementations
│   │       ├── imu.cpp        # IMU sensor interface
│   │       └── *.py           # Data analysis scripts
│   └── mobile_app/            # React Native/Expo mobile app
│       ├── app/               # Expo Router app directory
│       ├── lib/               # Shared libraries (Supabase, etc.)
│       └── package.json       # Node.js dependencies
├── arduino_files/             # PlatformIO Arduino project
│   ├── src/                   # Source code
│   └── platformio.ini        # PlatformIO configuration
├── data/                      # Collected sensor data
│   ├── emg_data/             # EMG sensor recordings
│   └── imu_data/             # IMU sensor recordings
│       ├── nine_dof_outputs/ # 9-axis IMU data
│       └── yaw_data_output/  # Yaw angle data
└── docs/                      # Project documentation
    └── software_arch_diagram/ # Architecture diagrams
```

## 🔧 Hardware Requirements

- **Microcontroller**: ESP32 (e.g., ESP32 DevKit, Arduino Uno R4 WiFi)
- **IMU Sensor**: 9DoF IMU (e.g., SparkFun ICM-20948)
- **EMG Sensor**: EMG sensor module compatible with ESP32
- **Mobile Device**: iOS (iPhone) or Android smartphone with BLE support

## 💻 Software Requirements

### Firmware Development
- [PlatformIO](https://platformio.org/) or Arduino IDE
- Arduino framework
- ESP32 board support

### Mobile App Development
- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- iOS Simulator (macOS) or Android Studio (for Android emulator)
- Physical iOS/Android device for BLE testing

### Python Data Analysis (Optional)
- Python 3.8+
- Required packages: `numpy`, `pandas`, `matplotlib` (see requirements in scripts)

## 🚀 Getting Started

### Firmware Setup

1. **Install PlatformIO**:
   ```bash
   # Using pip
   pip install platformio
   
   # Or using Homebrew (macOS)
   brew install platformio
   ```

2. **Navigate to the Arduino project**:
   ```bash
   cd arduino_files
   ```

3. **Install dependencies and build**:
   ```bash
   pio run
   ```

4. **Upload to ESP32**:
   ```bash
   pio run -t upload
   ```

5. **Monitor serial output**:
   ```bash
   pio device monitor
   ```

### Mobile App Setup

1. **Navigate to the mobile app directory**:
   ```bash
   cd apps/mobile_app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the Expo development server**:
   ```bash
   npx expo start
   ```

4. **Run on device**:
   - **iOS**: Press `i` in the terminal or scan QR code with Camera app
   - **Android**: Press `a` in the terminal or scan QR code with Expo Go app
   - **Web**: Press `w` in the terminal

5. **Configure environment variables** (if using Supabase):
   - Create a `.env` file in `apps/mobile_app/`
   - Add your Supabase credentials:
     ```
     EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
     EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

## 📱 Usage

### Connecting to Sensors

1. Power on the ESP32 device with connected sensors
2. Open the mobile app
3. Navigate to the device connection screen
4. Scan for BLE devices and select your ESP32
5. Establish connection and start data streaming

### Viewing Data

- **Real-time Visualization**: View live sensor data in the app's dashboard
- **Historical Data**: Access previously recorded sessions from the history tab
- **Data Export**: Export data as CSV files for offline analysis

### Data Collection

Sensor data is automatically saved to:
- **Local Storage**: SQLite database on the mobile device
- **Cloud Storage**: Supabase (if configured)
- **CSV Files**: Exported data files in `data/` directory

## 📊 Data Collection

The system collects the following sensor data:

- **IMU Data**: 9-axis motion data (accelerometer, gyroscope, magnetometer)
  - Acceleration (X, Y, Z)
  - Angular velocity (X, Y, Z)
  - Magnetic field (X, Y, Z)
  - Computed orientation (yaw, pitch, roll)

- **EMG Data**: Electromyography signals from muscle activity

Data files are timestamped and stored in the `data/` directory for analysis.

## 🤝 Contributing

This is a Final Year Design Project repository. For contributions or questions:

1. Create an issue for bugs or feature requests
2. Follow the existing code style and conventions
3. Ensure all tests pass before submitting changes

## 📄 License

This project is part of academic coursework at the University of Waterloo. All rights reserved.

---

**University of Waterloo** | **MTE481 Final Year Design Project**

For questions or support, please contact the project team.
