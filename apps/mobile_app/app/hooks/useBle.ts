import { useEffect, useRef, useState } from "react";
import { Alert, Platform, PermissionsAndroid } from "react-native";
import {
  BleManager,
  Characteristic,
  Device,
  State,
  Subscription,
} from "react-native-ble-plx";

// Types
export type ScannedDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  device: Device;
};

// type DataEntry = {
//   timestamp: string;
//   service: string;
//   characteristic: string;
//   bytes: number[];
// };

export function useBle() {
  // states
  const managerRef = useRef<BleManager | null>(null);
  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [isLogging, setIsLogging] = useState<boolean>(false);

  // ref values
  const notifSubsRef = useRef<Subscription[]>([]);
  const dataBufferRef = useRef<Uint8Array[]>([]);
  const loggingFlagRef = useRef<boolean>(false);
  const onBatchRef = useRef<((batch: Uint8Array[]) => void) | null>(null);
  const intentionalDisconnectRef = useRef(false);

  function getManager(): BleManager {
    if (!managerRef.current) {
      managerRef.current = new BleManager();
    }
    return managerRef.current;
  }

  useEffect(() => {
    const manager = getManager();
    manager.state().then((s) => setBluetoothState(s));
    const sub = manager.onStateChange((s) => setBluetoothState(s));
    return () => {
      sub.remove();
      manager.stopDeviceScan();
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  async function requestPermissions(): Promise<boolean> {
    if (Platform.OS === "android") {
      const apiLevel = Platform.Version;
      if (apiLevel >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(result).every(
          (v) => v === PermissionsAndroid.RESULTS.GRANTED,
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }

  async function startScan() {
    if (bluetoothState !== State.PoweredOn) {
      Alert.alert("Bluetooth off", "Turn on Bluetooth to scan for devices.");
      return;
    }
    const granted = await requestPermissions();
    if (!granted) {
      Alert.alert(
        "Permissions required",
        "Bluetooth permissions are needed to scan.",
      );
      return;
    }
    const manager = getManager();
    setIsScanning(true);
    setDevices([]);
    manager.startDeviceScan(
      null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          setIsScanning(false);
          Alert.alert("Scan error", error.message);
          return;
        }
        if (device) {
          const name = (device.name ?? device.localName ?? "").toLowerCase();
          if (!name.includes("esp32_workout")) return;

          setDevices((prev) => {
            const i = prev.findIndex((d) => d.id === device.id);
            if (i >= 0) {
              const next = [...prev];
              next[i] = {
                id: device.id,
                name: device.name ?? null,
                rssi: device.rssi,
                device,
              };
              return next;
            }
            return [
              ...prev,
              {
                id: device.id,
                name: device.name ?? null,
                rssi: device.rssi,
                device,
              },
            ];
          });
        }
      },
    );
    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  }

  function stopScan() {
    getManager().stopDeviceScan();
    setIsScanning(false);
  }

  function cleanupNotifications() {
    notifSubsRef.current.forEach((s) => s.remove());
    notifSubsRef.current = [];
  }

  async function connect(device: Device) {
    if (connectedDevice) {
      Alert.alert("Disconnect the current device first.");
      return;
    }
    setConnectingId(device.id);
    try {
      const d = await device.connect();
      await d.requestMTU(36);
      await d.discoverAllServicesAndCharacteristics();
      await subscribeToDevice(d);
      d.onDisconnected(() => {
        cleanupNotifications();
        setConnectedDevice(null);
        if (intentionalDisconnectRef.current) {
          intentionalDisconnectRef.current = false;
        } else {
          Alert.alert("Disconnected", "EVA device disconnected unexpectedly.");
        }
      });
      setConnectedDevice(d);
    } catch (e: any) {
      Alert.alert("Connection failed", e?.message ?? "Could not connect.");
    } finally {
      setConnectingId(null);
    }
  }

  async function disconnect() {
    if (!connectedDevice) return;
    intentionalDisconnectRef.current = true;
    cleanupNotifications();
    try {
      await connectedDevice.cancelConnection();
    } catch {
      // Swallow — cancelConnection often rejects during teardown
    }
    setConnectedDevice(null);
  }

  async function reset() {
    stopScan();
    await disconnect();
    setDevices([]);
  }

  /**
   * Start buffering BLE data and flushing to `onBatch` every second.
   * The callback receives an array of raw Uint8Array packets.
   */
  function startLogging(onBatch: (batch: Uint8Array[]) => void) {
    loggingFlagRef.current = true;
    onBatchRef.current = onBatch;
    setIsLogging(true);
    dataBufferRef.current = [];
  }

  function stopLogging() {
    loggingFlagRef.current = false;
    setIsLogging(false);

    if (dataBufferRef.current.length > 0) {
      const finalBatch = [...dataBufferRef.current];
      dataBufferRef.current = [];
      onBatchRef.current?.(finalBatch);
    }
    onBatchRef.current = null;
  }

  async function subscribeToDevice(d: Device) {
    let services;

    try {
      services = await d.services();
    } catch {
      return;
    }

    for (const service of services) {
      let chars;
      try {
        chars = await service.characteristics();
      } catch {
        continue;
      }

      for (const char of chars) {
        if (!char.isNotifiable && !char.isIndicatable) continue;

        try {
          // where we are listening for the characteristics from BLE (IMPORTANT)
          const sub = char.monitor((error: any, c: Characteristic | null) => {
            if (error || !c?.value) return;

            // decode base64 from characteristic value to binary string, then to bytes
            const binaryString: string = atob(c.value);
            const bytes = new Uint8Array(binaryString.length);

            for (let i = 0; i < bytes.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            console.log("BLE data:", bytes); // TODO: delete after testing is done

            // send bytes to data buffer
            dataBufferRef.current.push(bytes);

            // ensure buffer stays at the same size
            if (!loggingFlagRef.current && dataBufferRef.current.length > 50) {
              dataBufferRef.current.shift();
            }
          });
          notifSubsRef.current.push(sub);
        } catch {
          // characteristic doesn't actually support monitoring
        }
      }
    }
  }

  useEffect(() => {
    if (!isLogging) return;
    const interval = setInterval(() => {
      if (dataBufferRef.current.length === 0) return;

      const batch = [...dataBufferRef.current];
      dataBufferRef.current = [];
      onBatchRef.current?.(batch);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLogging]);

  const isReady = bluetoothState === State.PoweredOn;

  return {
    bluetoothState,
    isScanning,
    devices,
    connectedDevice,
    connectingId,
    isReady,
    startScan,
    stopScan,
    connect,
    disconnect,
    reset,
    getManager,
    notifSubsRef,
    cleanupNotifications,
    startLogging,
    stopLogging,
    isLogging,
  };
}
