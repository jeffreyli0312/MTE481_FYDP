import React, { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button, Badge, ActivityIndicator } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { useBle } from "../hooks/useBle";
import { formatMMSS } from "../utils/format";
import type { SessionRecord, SetRecord } from "../types/workout";

interface SessionViewProps {
  exerciseName: string;
  onBack: () => void;
  onEndSession: (session: SessionRecord) => void;
}

export default function SessionView({ exerciseName, onBack, onEndSession }: SessionViewProps) {
  const { colors } = useAppTheme();
  const ble = useBle();

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionTimerRunning, setSessionTimerRunning] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [setSeconds, setSetSeconds] = useState(0);
  const [setTimerRunning, setSetTimerRunning] = useState(false);
  const [liveForceN, setLiveForceN] = useState(0);
  const [completedSets, setCompletedSets] = useState<SetRecord[]>([]);

  React.useEffect(() => {
    if (!sessionTimerRunning) return;
    const interval = setInterval(() => setSessionSeconds((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [sessionTimerRunning]);

  React.useEffect(() => {
    if (!setTimerRunning) return;
    const interval = setInterval(() => setSetSeconds((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [setTimerRunning]);

  React.useEffect(() => {
    if (!isRecording) return;
    setLiveForceN(80.6);
    const interval = setInterval(() => {
      setLiveForceN((prev) => {
        const jitter = (Math.random() - 0.5) * 6;
        return Math.round(Math.max(0, prev + jitter) * 10) / 10;
      });
    }, 350);
    return () => clearInterval(interval);
  }, [isRecording]);

  function handleBack() {
    setIsRecording(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    ble.reset();
    onBack();
  }

  function startRecording() {
    setIsRecording(true);
    setSetSeconds(0);
    setSetTimerRunning(true);
  }

  function endRecording() {
    setIsRecording(false);
    setSetTimerRunning(false);
    const duration = Math.max(1, setSeconds);
    const avgForce = liveForceN > 0 ? liveForceN : 80.6;
    setCompletedSets((prev) => [
      ...prev,
      { id: `set-${Date.now()}`, durationSec: duration, avgForceN: avgForce },
    ]);
    setSetSeconds(0);
  }

  function handleEndSession() {
    if (completedSets.length === 0) return;
    setIsRecording(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    ble.reset();

    const setsCount = completedSets.length;
    const avgForce =
      setsCount === 0
        ? 0
        : Math.round(
            (completedSets.reduce((sum, s) => sum + s.avgForceN, 0) / setsCount) * 10
          ) / 10;

    onEndSession({
      id: `sess-${Date.now()}`,
      dateISO: new Date().toISOString(),
      durationSec: sessionSeconds,
      setsCount,
      avgForceN: avgForce,
    });
  }

  return (
    <>
      {/* Header */}
      <View style={styles.sessionTopRow}>
        <Pressable onPress={handleBack} style={styles.backRow}>
          <Feather name="arrow-left" size={18} color={colors.onSurface} />
          <Text variant="labelLarge" style={{ color: colors.onSurface }}>
            Back
          </Text>
        </Pressable>

        <View style={styles.inlineRow}>
          <Feather name="clock" size={16} color={colors.primary} />
          <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: "900" }}>
            {formatMMSS(sessionSeconds)}
          </Text>
        </View>
      </View>

      <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "900", marginBottom: 10 }}>
        {exerciseName} Session
      </Text>
      <View style={[styles.divider, { backgroundColor: colors.outline }]} />

      {/* Device Connection */}
      <DeviceConnectionCard ble={ble} />

      {/* Recording / Ready card */}
      <Card style={styles.bigCard} mode="outlined">
        <Card.Content>
          {isRecording ? (
            <>
              <View style={{ alignItems: "center", marginBottom: 6 }}>
                <Badge style={{ backgroundColor: colors.danger }}>Recording</Badge>
              </View>

              <Text
                variant="displaySmall"
                style={{ color: colors.onSurface, fontWeight: "900", textAlign: "center", marginTop: 6 }}
              >
                {formatMMSS(setSeconds)}
              </Text>
              <Text
                variant="labelLarge"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 2, marginBottom: 12 }}
              >
                Set Duration
              </Text>

              <Card style={[styles.forceCard, { borderColor: colors.infoBorder }]} mode="outlined">
                <Card.Content style={{ alignItems: "center", backgroundColor: colors.infoBg, borderRadius: 12 }}>
                  <Text variant="labelLarge" style={{ color: colors.primary, fontWeight: "900" }}>
                    Live Force Reading
                  </Text>
                  <Text variant="headlineMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                    {liveForceN.toFixed(1)}N
                  </Text>
                </Card.Content>
              </Card>

              <Button
                mode="contained"
                onPress={endRecording}
                icon="stop"
                style={styles.actionBtn}
                buttonColor={colors.danger}
                textColor="#ffffff"
              >
                End Recording
              </Button>
            </>
          ) : (
            <>
              <Text variant="titleMedium" style={{ color: colors.onSurface, textAlign: "center", fontWeight: "900" }}>
                Ready to start your next set?
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 6 }}>
                Press the button below to begin recording
              </Text>

              {/* Uncomment to require EVA device connection before recording:
              {!ble.connectedDevice && (
                <Text variant="bodySmall" style={{ color: colors.error, textAlign: "center", marginBottom: 8 }}>
                  Please connect to an EVA device to start recording.
                </Text>
              )} */}
              <Button
                mode="contained"
                onPress={startRecording}
                // disabled={!ble.connectedDevice}
                icon="play"
                style={styles.actionBtn}
                buttonColor={colors.success}
                textColor="#ffffff"
              >
                Start Recording
              </Button>
            </>
          )}
        </Card.Content>
      </Card>

      {/* Completed Sets */}
      <View style={styles.completedHeaderRow}>
        <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "900" }}>
          Completed Sets
        </Text>
        <Badge style={{ backgroundColor: colors.outline }}>
          {completedSets.length}
        </Badge>
      </View>

      {completedSets.length === 0 ? (
        <Card style={[styles.infoCard, { borderColor: colors.infoBorder }]} mode="outlined">
          <Card.Content style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}>
            <Text variant="bodySmall" style={{ color: colors.infoText, textAlign: "center" }}>
              No sets completed yet. Start recording to begin!
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {completedSets.map((set, idx) => (
            <Card key={set.id} style={styles.setRowCard} mode="outlined">
              <Card.Content style={styles.setRowContent}>
                <View
                  style={[
                    styles.setNumberCircle,
                    { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
                  ]}
                >
                  <Text style={{ fontWeight: "900", color: colors.primary }}>
                    {idx + 1}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                    Set {idx + 1}
                  </Text>
                  <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: "900", marginTop: 2 }}>
                    {set.durationSec}s
                  </Text>
                </View>

                <View style={styles.inlineRow}>
                  <Feather name="bar-chart-2" size={16} color={colors.onSurfaceVariant} />
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                    View Stats
                  </Text>
                </View>
              </Card.Content>
            </Card>
          ))}
        </View>
      )}

      {/* End Session */}
      <Button
        mode="outlined"
        onPress={handleEndSession}
        disabled={completedSets.length === 0}
        style={styles.endSessionBtn}
        textColor={completedSets.length === 0 ? colors.onSurfaceVariant : colors.onSurface}
      >
        End Session
      </Button>
    </>
  );
}

// ─── Device Connection sub-component ───

function DeviceConnectionCard({ ble }: { ble: ReturnType<typeof useBle> }) {
  const { colors } = useAppTheme();

  return (
    <Card style={styles.bigCard} mode="outlined">
      <Card.Content>
        <View style={styles.bleHeaderRow}>
          <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "900" }}>
            Device Connection
          </Text>
          <View
            style={[
              styles.bleDot,
              { backgroundColor: ble.connectedDevice ? colors.success : colors.error },
            ]}
          />
        </View>

        {ble.connectedDevice ? (
          <View style={styles.connectedRow}>
            <View style={styles.inlineRow}>
              <Feather name="bluetooth" size={16} color={colors.success} />
              <Text variant="bodyMedium" style={{ color: colors.success }}>
                {ble.connectedDevice.name || ble.connectedDevice.id}
              </Text>
            </View>
            <Button mode="text" onPress={ble.disconnect} compact textColor={colors.error}>
              Disconnect
            </Button>
          </View>
        ) : (
          <>
            <Card
              style={[styles.warningCard, { borderColor: colors.warningBorder }]}
              mode="outlined"
            >
              <Card.Content style={{ backgroundColor: colors.warningBg, borderRadius: 12 }}>
                <Text variant="bodySmall" style={{ color: colors.warningText, textAlign: "center" }}>
                  Connect to an EVA device to enable sensor data recording.
                </Text>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              onPress={ble.isScanning ? ble.stopScan : ble.startScan}
              disabled={!ble.isReady || !!ble.connectingId}
              icon={ble.isScanning ? undefined : "magnify"}
              loading={ble.isScanning}
              style={styles.scanBtn}
              buttonColor={colors.primary}
              textColor={colors.onPrimary}
            >
              {ble.isScanning ? "Stop Scan" : "Scan for Devices"}
            </Button>

            {ble.devices.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                  Found Devices ({ble.devices.length})
                </Text>
                {ble.devices.map((item) => {
                  const isConnecting = ble.connectingId === item.id;
                  return (
                    <Card
                      key={item.id}
                      style={[styles.bleDeviceCard, { opacity: isConnecting ? 0.7 : 1 }]}
                      mode="outlined"
                      onPress={() => !ble.connectingId && ble.connect(item.device)}
                    >
                      <Card.Content style={styles.deviceContent}>
                        <View style={styles.deviceLeft}>
                          <Feather name="bluetooth" size={16} color={colors.onSurfaceVariant} />
                          <View>
                            <Text variant="bodyMedium" style={{ color: colors.onSurface }}>
                              {item.name || "Unknown"}
                            </Text>
                            {item.rssi != null && (
                              <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                                RSSI: {item.rssi}
                              </Text>
                            )}
                          </View>
                        </View>
                        {isConnecting ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Feather name="chevron-right" size={18} color={colors.onSurfaceVariant} />
                        )}
                      </Card.Content>
                    </Card>
                  );
                })}
              </View>
            )}

            {ble.devices.length === 0 && !ble.isScanning && (
              <Text
                variant="bodySmall"
                style={{ color: colors.onSurfaceVariant, marginTop: 8, textAlign: "center", fontStyle: "italic" }}
              >
                Tap scan to discover nearby EVA devices
              </Text>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  sessionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  bigCard: {
    borderRadius: 16,
    marginBottom: 18,
  },
  forceCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  actionBtn: {
    marginTop: 14,
    borderRadius: 10,
  },
  completedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  infoCard: {
    borderRadius: 12,
  },
  setRowCard: {
    borderRadius: 12,
  },
  setRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  setNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  endSessionBtn: {
    marginTop: 14,
    borderRadius: 10,
  },
  bleHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  bleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  connectedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  warningCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  scanBtn: {
    borderRadius: 10,
  },
  bleDeviceCard: {
    borderRadius: 12,
    marginBottom: 8,
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
});
