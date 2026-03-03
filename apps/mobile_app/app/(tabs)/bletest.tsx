import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Alert,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { Card, Text, Button, ActivityIndicator, Badge } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import {
  BleManager,
  Characteristic,
  Device,
  State,
  Subscription,
} from "react-native-ble-plx";
import { useAppTheme } from "../theme";

type ScannedDevice = {
  id: string;
  name: string | null;
  rssi: number | null;
  device: Device;
};

type DataEntry = {
  timestamp: string;
  service: string;
  characteristic: string;
  bytes: number[];
};

function getStateLabel(state: State): string {
  switch (state) {
    case State.Unknown:
      return "Unknown";
    case State.Resetting:
      return "Resetting";
    case State.Unsupported:
      return "Unsupported";
    case State.Unauthorized:
      return "Unauthorized";
    case State.PoweredOff:
      return "Off";
    case State.PoweredOn:
      return "On";
    default:
      return "Unknown";
  }
}

export default function BLETestScreen() {
  const { colors, dark } = useAppTheme();

  const managerRef = useRef<BleManager | null>(null);

  const [bluetoothState, setBluetoothState] = useState<State>(State.Unknown);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [dataLog, setDataLog] = useState<DataEntry[]>([]);
  const notifSubsRef = useRef<Subscription[]>([]);
  const dataScrollRef = useRef<ScrollView>(null);

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
      Alert.alert(
        "Permissions required",
        "Bluetooth permissions are needed to scan for devices."
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
      }
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

  function decodeBase64ToBytes(b64: string): number[] {
    try {
      const raw = atob(b64);
      return Array.from(raw, (ch) => ch.charCodeAt(0));
    } catch {
      return [];
    }
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
          const sub = char.monitor((error: any, c: Characteristic | null) => {
            if (error || !c?.value) return;
            const bytes = decodeBase64ToBytes(c.value);
            console.log("BLE data:", bytes);
            const now = new Date();
            const ts =
              now.toLocaleTimeString("en-US", { hour12: false }) +
              "." +
              String(now.getMilliseconds()).padStart(3, "0");

            setDataLog((prev) => {
              const next = [
                ...prev,
                {
                  timestamp: ts,
                  service: service.uuid.slice(0, 8),
                  characteristic: char.uuid.slice(0, 8),
                  bytes,
                },
              ];
              return next.length > 200 ? next.slice(-200) : next;
            });
          });
          notifSubsRef.current.push(sub);
        } catch {
          // characteristic doesn't actually support monitoring
        }
      }
    }
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
        Alert.alert("Disconnected", "Device disconnected.");
      });
      setConnectedDevice(d);
      setDataLog([]);
      await subscribeToDevice(d);
    } catch (e: any) {
      Alert.alert("Connection failed", e?.message ?? "Could not connect.");
    } finally {
      setConnectingId(null);
    }
  }

  function cleanupNotifications() {
    notifSubsRef.current.forEach((s) => s.remove());
    notifSubsRef.current = [];
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

  const isReady = bluetoothState === State.PoweredOn;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text variant="titleLarge" style={[styles.pageTitle, { color: colors.onSurface }]}>
        BLE
      </Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        style={{ backgroundColor: colors.background }}
      >
        {/* Status */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.cardRow}>
              <Text variant="titleSmall">Bluetooth</Text>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isReady ? colors.success : colors.error },
                ]}
              />
            </View>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
              {getStateLabel(bluetoothState)}
            </Text>
          </Card.Content>
        </Card>

        {/* Connected device */}
        {connectedDevice && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <View style={styles.cardRow}>
                <Text variant="titleSmall">Connected</Text>
                <Button mode="text" onPress={disconnect} compact textColor={colors.error}>
                  Disconnect
                </Button>
              </View>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                {connectedDevice.name || connectedDevice.id}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Live Data */}
        {connectedDevice && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <View style={styles.cardRow}>
                <Text variant="titleSmall">Live Data</Text>
                <Button
                  mode="text"
                  onPress={() => setDataLog([])}
                  compact
                  textColor={colors.primary}
                >
                  Clear
                </Button>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: colors.onSurfaceVariant, marginTop: 4, marginBottom: 8 }}
              >
                {dataLog.length === 0
                  ? "Waiting for data from device..."
                  : `${dataLog.length} message${dataLog.length === 1 ? "" : "s"} received`}
              </Text>
              <ScrollView
                ref={dataScrollRef}
                style={[
                  styles.dataLogContainer,
                  { backgroundColor: dark ? "#0d0f14" : "#f0f0f0" },
                ]}
                onContentSizeChange={() =>
                  dataScrollRef.current?.scrollToEnd({ animated: true })
                }
              >
                {dataLog.map((entry, idx) => (
                  <Text
                    key={idx}
                    style={[
                      styles.dataLogLine,
                      { color: dark ? "#a5f3fc" : "#0e7490" },
                    ]}
                  >
                    <Text style={{ color: colors.onSurfaceVariant }}>
                      {entry.timestamp}{" "}
                    </Text>
                    [{entry.bytes.join(", ")}]
                  </Text>
                ))}
              </ScrollView>
            </Card.Content>
          </Card>
        )}

        {/* Scan */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleSmall">Scan</Text>
            <Button
              mode="contained"
              onPress={isScanning ? stopScan : startScan}
              disabled={!isReady || !!connectingId}
              icon={isScanning ? undefined : "magnify"}
              loading={isScanning}
              style={styles.scanBtn}
              buttonColor={colors.primary}
              textColor={colors.onPrimary}
            >
              {isScanning ? "Stop" : "Scan (10s)"}
            </Button>
            {isScanning && (
              <Text
                variant="labelSmall"
                style={{ color: colors.onSurfaceVariant, marginTop: 8, fontStyle: "italic" }}
              >
                Scanning...
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Device list */}
        <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 12 }}>
          Devices ({devices.length})
        </Text>

        {devices.length === 0 && !isScanning && (
          <Card style={[styles.card, styles.emptyCard]} mode="outlined">
            <Card.Content style={{ alignItems: "center" }}>
              <Feather name="bluetooth" size={28} color={colors.onSurfaceVariant} />
              <Text
                variant="bodyMedium"
                style={{ color: colors.onSurfaceVariant, marginTop: 8 }}
              >
                Start a scan to see devices.
              </Text>
            </Card.Content>
          </Card>
        )}

        {devices.map((item) => {
          const isConnected = connectedDevice?.id === item.id;
          const isConnecting = connectingId === item.id;
          const canTap = isReady && !connectedDevice && !isConnecting;

          return (
            <Card
              key={item.id}
              style={[
                styles.deviceCard,
                {
                  borderColor: isConnected ? colors.success : colors.outline,
                  opacity: canTap ? 1 : 0.7,
                },
              ]}
              mode="outlined"
              onPress={() => canTap && connect(item.device)}
            >
              <Card.Content style={styles.deviceContent}>
                <View style={styles.deviceLeft}>
                  <Feather
                    name="bluetooth"
                    size={18}
                    color={isConnected ? colors.success : colors.onSurfaceVariant}
                  />
                  <View>
                    <Text variant="titleSmall">{item.name || "Unknown"}</Text>
                    <Text
                      variant="labelSmall"
                      style={{ color: colors.onSurfaceVariant, fontFamily: "monospace", marginTop: 2 }}
                    >
                      {item.id}
                    </Text>
                    {item.rssi != null && (
                      <Text
                        variant="labelSmall"
                        style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
                      >
                        RSSI: {item.rssi}
                      </Text>
                    )}
                  </View>
                </View>
                {isConnecting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : isConnected ? (
                  <Badge style={{ backgroundColor: colors.success }}>Connected</Badge>
                ) : canTap ? (
                  <Feather name="chevron-right" size={20} color={colors.onSurfaceVariant} />
                ) : null}
              </Card.Content>
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pageTitle: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scanBtn: {
    marginTop: 12,
    borderRadius: 12,
  },
  emptyCard: {
    paddingVertical: 8,
  },
  deviceCard: {
    marginBottom: 12,
    borderRadius: 16,
  },
  deviceContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  dataLogContainer: {
    maxHeight: 240,
    borderRadius: 10,
    padding: 10,
  },
  dataLogLine: {
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 18,
  },
});
