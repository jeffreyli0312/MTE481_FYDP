import { useEffect, useRef, useState } from "react";
import { Alert, Platform, PermissionsAndroid } from "react-native";
import {
  BleManager,
  Device,
  State,
  Subscription,
} from "react-native-ble-plx";

export type ScannedDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  device: Device;
};

export function useBle() {
  const managerRef = useRef<BleManager | null>(null);
  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const notifSubsRef = useRef<Subscription[]>([]);

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
          (v) => v === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
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
      Alert.alert("Permissions required", "Bluetooth permissions are needed to scan.");
      return;
    }
    const manager = getManager();
    setIsScanning(true);
    setDevices([]);
    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        setIsScanning(false);
        Alert.alert("Scan error", error.message);
        return;
      }
      if (device) {
        setDevices((prev) => {
          const i = prev.findIndex((d) => d.id === device.id);
          if (i >= 0) {
            const next = [...prev];
            next[i] = { id: device.id, name: device.name ?? null, rssi: device.rssi, device };
            return next;
          }
          return [...prev, { id: device.id, name: device.name ?? null, rssi: device.rssi, device }];
        });
      }
    });
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
      await d.requestMTU(256);
      await d.discoverAllServicesAndCharacteristics();
      d.onDisconnected(() => {
        cleanupNotifications();
        setConnectedDevice(null);
        Alert.alert("Disconnected", "EVA device disconnected.");
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
    try {
      cleanupNotifications();
      await connectedDevice.cancelConnection();
      setConnectedDevice(null);
    } catch (e: any) {
      Alert.alert("Disconnect error", e?.message ?? "Could not disconnect.");
    }
  }

  function reset() {
    stopScan();
    disconnect();
    setDevices([]);
  }

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
  };
}
