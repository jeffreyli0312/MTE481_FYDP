import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  BleManager,
  Characteristic,
  Device,
  State,
  Subscription,
} from "react-native-ble-plx";
import { useTheme } from "../context/ThemeContext";

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
  const { theme } = useTheme();
  const dark = theme === "dark";

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
      Alert.alert(
        "Bluetooth off",
        "Turn on Bluetooth to scan for devices."
      );
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
    }, 1000000000);
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
            const now = new Date();
            const ts = now.toLocaleTimeString("en-US", { hour12: false }) +
              "." + String(now.getMilliseconds()).padStart(3, "0");

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
  const cardBg = dark ? "#1e2128" : "#ffffff";
  const cardBorder = dark ? "#2b2f3a" : "#e5e7eb";
  const textPrimary = dark ? "#ffffff" : "#111827";
  const textMuted = dark ? "#9ca3af" : "#6b7280";
  const accent = dark ? "#60a5fa" : "#2563eb";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: dark ? "#14161c" : "#f5f5f5" }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text style={[styles.pageTitle, { color: textPrimary }]}>
        BLE
      </Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        style={{ backgroundColor: dark ? "#14161c" : "#f5f5f5" }}
      >
        {/* Status */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>
              Bluetooth
            </Text>
            <View
              style={[
                styles.dot,
                { backgroundColor: isReady ? "#22c55e" : "#ef4444" },
              ]}
            />
          </View>
          <Text style={[styles.muted, { color: textMuted }]}>
            {getStateLabel(bluetoothState)}
          </Text>
        </View>

        {/* Connected device */}
        {connectedDevice && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                Connected
              </Text>
              <Pressable onPress={disconnect} hitSlop={12}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
            </View>
            <Text style={[styles.muted, { color: textMuted }]}>
              {connectedDevice.name || connectedDevice.id}
            </Text>
          </View>
        )}

        {/* Live Data */}
        {connectedDevice && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardRow}>
              <Text style={[styles.cardTitle, { color: textPrimary }]}>
                Live Data
              </Text>
              <Pressable onPress={() => setDataLog([])} hitSlop={12}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: accent }}>
                  Clear
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.muted, { color: textMuted, marginBottom: 8 }]}>
              {dataLog.length === 0
                ? "Waiting for data from device…"
                : `${dataLog.length} message${dataLog.length === 1 ? "" : "s"} received`}
            </Text>
            <ScrollView
              ref={dataScrollRef}
              style={[styles.dataLogContainer, { backgroundColor: dark ? "#0d0f14" : "#f0f0f0" }]}
              onContentSizeChange={() =>
                dataScrollRef.current?.scrollToEnd({ animated: true })
              }
            >
              {dataLog.map((entry, idx) => (
                <Text
                  key={idx}
                  style={[styles.dataLogLine, { color: dark ? "#a5f3fc" : "#0e7490" }]}
                >
                  <Text style={{ color: textMuted }}>{entry.timestamp} </Text>
                  [{entry.bytes.join(", ")}]
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Scan */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>
            Scan
          </Text>
          <Pressable
            onPress={isScanning ? stopScan : startScan}
            disabled={!isReady || !!connectingId}
            style={[
              styles.primaryBtn,
              {
                backgroundColor:
                  isReady && !connectingId ? accent : dark ? "#374151" : "#d1d5db",
              },
            ]}
          >
            {isScanning ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.btnText}>Stop</Text>
              </>
            ) : (
              <>
                <Feather name="search" size={18} color="#fff" />
                <Text style={styles.btnText}>Scan (10s)</Text>
              </>
            )}
          </Pressable>
          {isScanning && (
            <Text style={[styles.hint, { color: textMuted }]}>
              Scanning…
            </Text>
          )}
        </View>

        {/* Device list */}
        <Text style={[styles.sectionTitle, { color: textPrimary }]}>
          Devices ({devices.length})
        </Text>

        {devices.length === 0 && !isScanning && (
          <View style={[styles.card, styles.emptyCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Feather name="bluetooth" size={28} color={textMuted} />
            <Text style={[styles.muted, { color: textMuted }]}>
              Start a scan to see devices.
            </Text>
          </View>
        )}

        {devices.map((item) => {
          const isConnected = connectedDevice?.id === item.id;
          const isConnecting = connectingId === item.id;
          const canTap = isReady && !connectedDevice && !isConnecting;

          return (
            <Pressable
              key={item.id}
              onPress={() => canTap && connect(item.device)}
              disabled={!canTap}
              style={[
                styles.deviceCard,
                {
                  backgroundColor: cardBg,
                  borderColor: isConnected ? "#22c55e" : cardBorder,
                  opacity: canTap ? 1 : 0.7,
                },
              ]}
            >
              <View style={styles.deviceLeft}>
                <Feather
                  name="bluetooth"
                  size={18}
                  color={isConnected ? "#22c55e" : textMuted}
                />
                <View>
                  <Text style={[styles.deviceName, { color: textPrimary }]}>
                    {item.name || "Unknown"}
                  </Text>
                  <Text style={[styles.deviceId, { color: textMuted }]}>
                    {item.id}
                  </Text>
                  {item.rssi != null && (
                    <Text style={[styles.deviceRssi, { color: textMuted }]}>
                      RSSI: {item.rssi}
                    </Text>
                  )}
                </View>
              </View>
              {isConnecting ? (
                <ActivityIndicator size="small" color={accent} />
              ) : isConnected ? (
                <Text style={styles.connectedBadge}>Connected</Text>
              ) : canTap ? (
                <Feather name="chevron-right" size={20} color={textMuted} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    elevation: 4,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  muted: {
    fontSize: 14,
    marginTop: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  disconnectText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ef4444",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: "italic",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 24,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    elevation: 4,
  },
  deviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
  },
  deviceId: {
    fontSize: 11,
    fontFamily: "monospace",
    marginTop: 2,
  },
  deviceRssi: {
    fontSize: 11,
    marginTop: 2,
  },
  connectedBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
    backgroundColor: "#22c55e",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
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
