import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import * as SQLite from "expo-sqlite";
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
  user_id: string;
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

// Setup for SQLLite below
const db = SQLite.openDatabaseSync("ble.db");
function initDb() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      label TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sets_session ON sets(session_id);

    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      set_id TEXT NOT NULL,
      user_id TEXT NOT NULL,

      t_ms INTEGER NOT NULL,

      emg_left_tricep INTEGER,
      emg_left_pec INTEGER,
      emg_right_tricep INTEGER,
      emg_right_pec INTEGER,

      l_accx INTEGER, l_accy INTEGER, l_accz INTEGER,
      l_gyrx INTEGER, l_gyry INTEGER, l_gyrz INTEGER,

      r_accx INTEGER, r_accy INTEGER, r_accz INTEGER,
      r_gyrx INTEGER, r_gyry INTEGER, r_gyrz INTEGER,

      received_at INTEGER NOT NULL,
      service_uuid TEXT,
      characteristic_uuid TEXT,

      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_samples_set_time ON samples(set_id, t_ms);
    CREATE INDEX IF NOT EXISTS idx_samples_session_time ON samples(session_id, t_ms);
  `);
}

function readUint32LE(bytes: number[], offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0
  );
}

function readInt16LE(bytes: number[], offset: number) {
  const v = bytes[offset] | (bytes[offset + 1] << 8);
  return v & 0x8000 ? v - 0x10000 : v;
}

function parsePacket(bytes: number[]) {
  if (bytes.length < 36) return null;

  const t_ms = readUint32LE(bytes, 0);

  return {
    t_ms,
    emg_left_tricep: readInt16LE(bytes, 4),
    emg_left_pec: readInt16LE(bytes, 6),
    emg_right_tricep: readInt16LE(bytes, 8),
    emg_right_pec: readInt16LE(bytes, 10),

    l_accx: readInt16LE(bytes, 12),
    l_accy: readInt16LE(bytes, 14),
    l_accz: readInt16LE(bytes, 16),
    l_gyrx: readInt16LE(bytes, 18),
    l_gyry: readInt16LE(bytes, 20),
    l_gyrz: readInt16LE(bytes, 22),

    r_accx: readInt16LE(bytes, 24),
    r_accy: readInt16LE(bytes, 26),
    r_accz: readInt16LE(bytes, 28),
    r_gyrx: readInt16LE(bytes, 30),
    r_gyry: readInt16LE(bytes, 32),
    r_gyrz: readInt16LE(bytes, 34),
  };
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);

  function startSessionRow(user_id: string, device_id?: string) {
    const sid = newId();
    db.runSync(
      `INSERT INTO sessions (id, user_id, device_id, started_at) VALUES (?, ?, ?, ?)`,
      [sid, user_id, device_id ?? null, Date.now()]
    );
    setSessionId(sid);
    return sid;
  }

  function endSessionRow(sid: string) {
    db.runSync(`UPDATE sessions SET ended_at = ? WHERE id = ?`, [Date.now(), sid]);
  }

  function startSetRow(user_id: string, session_id: string, label?: string) {
  const sid = newId(); // set id
  db.runSync(
    `INSERT INTO sets (id, session_id, user_id, label, started_at)
     VALUES (?, ?, ?, ?, ?)`,
    [sid, session_id, user_id, label ?? null, Date.now()]
  );
  setSetId(sid);
  return sid;
}

function endSetRow(set_id: string) {
  db.runSync(`UPDATE sets SET ended_at = ? WHERE id = ?`, [Date.now(), set_id]);
}

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

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const uid = authData.user?.id ?? null;
        if (!uid) throw new Error("Not logged in");

        if (!cancelled) setUserId(uid);
      } catch (e: any) {
        if (!cancelled) {
          setUserId(null);
          Alert.alert("Auth", e?.message ?? "Not logged in");
        }
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    initDb();
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

  async function subscribeToDevice(d: Device, uid: string, sid: string) {
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
            /* Assume bytes has format
            
            | Byte Index | Meaning |
            |------------|---------|
            | 0-3        | timestamp (uint32, ms) |
            | 4-5        | left_tricep EMG (int16) |
            | 6-7        | left_pec EMG (int16) |
            | 8-9        | right_tricep EMG (int16) |
            | 10-11      | right_pec EMG (int16) |
            | 12-13      | left accx (int16) |
            | 14-15      | left accy (int16) |
            | 16-17      | left accz (int16) |
            | 18-19      | left gyrx (int16) |
            | 20-21      | left gyry (int16) |
            | 22-23      | left gyrz (int16) |
            | 24-25      | right accx (int16) |
            | 26-27      | right accy (int16) |
            | 28-29      | right accz (int16) |
            | 30-31      | right gyrx (int16) |
            | 32-33      | right gyry (int16) |
            | 34-35      | right gyrz (int16) |
            */

            const parsed = parsePacket(bytes);
            if (!parsed) return;

            if (!uid || !sid) return;

            db.runSync(
              `INSERT INTO samples (
    session_id, user_id, t_ms,
    emg_left_tricep, emg_left_pec, emg_right_tricep, emg_right_pec,
    l_accx, l_accy, l_accz, l_gyrx, l_gyry, l_gyrz,
    r_accx, r_accy, r_accz, r_gyrx, r_gyry, r_gyrz,
    received_at, service_uuid, characteristic_uuid
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                sid,
                uid,
                parsed.t_ms,

                parsed.emg_left_tricep,
                parsed.emg_left_pec,
                parsed.emg_right_tricep,
                parsed.emg_right_pec,

                parsed.l_accx,
                parsed.l_accy,
                parsed.l_accz,
                parsed.l_gyrx,
                parsed.l_gyry,
                parsed.l_gyrz,

                parsed.r_accx,
                parsed.r_accy,
                parsed.r_accz,
                parsed.r_gyrx,
                parsed.r_gyry,
                parsed.r_gyrz,

                Date.now(),
                service.uuid,
                char.uuid,
              ]
            );

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
                  user_id: uid,
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

        if (sessionId) {
          endSessionRow(sessionId);
          setSessionId(null);
        }

        setConnectedDevice(null);
        Alert.alert("Disconnected", "Device disconnected.");
      });
      setConnectedDevice(d);
      setDataLog([]);

      if (!userId) throw new Error("Not logged in");

      // start a new sqlite session for this connection
      const sid = startSessionRow(userId, d.id);

      await subscribeToDevice(d, userId, sid);
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

      if (sessionId) {
        endSessionRow(sessionId);
        setSessionId(null);
      }

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
