import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, Button, Badge } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import { useBle } from "../hooks/useBle";
import { formatMMSS, MovingAverage } from "../utils/format";
import { ProgressBar } from "react-native-paper";
import BackButton from "./BackButton";
import DeviceConnectionCard from "./DeviceConnectionCard";
import {
  insertSession,
  insertSet,
  endSet as dbEndSet,
  endSession as dbEndSession,
  insertSample,
    parsePacket,
    countSamplesForSet,
    getLatestCalibration,
    saveBaselineOffsets,
    insertRep,
    updateSetRepCount,
    type CalibrationRow,
    type EmgChannel,
  } from "../sqlite/bleDb";
import type { SessionRecord, SetRecord } from "../types/workout";

interface SessionViewProps {
  exerciseName: string;
  onBack: () => void;
  onEndSession: (session: SessionRecord) => void;
}

export default function SessionView({
  exerciseName,
  onBack,
  onEndSession,
}: SessionViewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const ble = useBle();

  const userId = user?.id ?? "anonymous";
  const sessionIdRef = useRef(`sess_${Date.now()}`);
  const currentSetIdRef = useRef<string | null>(null);
  const sessionInsertedRef = useRef(false); // true once insertSession has run
  const [sampleCount, setSampleCount] = useState(0);

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionTimerRunning, setSessionTimerRunning] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [isBaseline, setIsBaseline] = useState(false);
  const [baselineProgress, setBaselineProgress] = useState(0);
  const [setSeconds, setSetSeconds] = useState(0);
  const [setTimerRunning, setSetTimerRunning] = useState(false);
  const [completedSets, setCompletedSets] = useState<SetRecord[]>([]);

  // Baseline offset per EMG channel (subtracted from every sample)
  const emgOffsetRef = useRef({ emg_left_tricep: 0, emg_left_pec: 0, emg_right_tricep: 0, emg_right_pec: 0 });
  const baselineSamplesRef = useRef<{ emg_left_tricep: number[]; emg_left_pec: number[]; emg_right_tricep: number[]; emg_right_pec: number[] }>({ emg_left_tricep: [], emg_left_pec: [], emg_right_tricep: [], emg_right_pec: [] });
  const baselineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // MVC calibration + Schmitt trigger rep counter
  const [calibration, setCalibration] = useState<CalibrationRow | null>(null);
  const [repCount, setRepCount] = useState(0);
  const repCountRef = useRef(0);
  const schmittStateRef = useRef<"low" | "high">("low");
  const emgMaRef = useRef(new MovingAverage(10));

  // Per-rep timestamp tracking
  const repStartMsRef = useRef(0);
  const repEmgAccRef = useRef<number[]>([]);
  const repPeakRef = useRef(0);

  const mvcValue = calibration?.mvc_value ?? 0;
  const calibratedChannel = (calibration?.emg_channel ?? "emg_left_pec") as EmgChannel;
  const upperThreshold = mvcValue * 0.60;
  const lowerThreshold = mvcValue * 0.35;

  // Load calibration on mount — session row is NOT inserted until first set starts
  useEffect(() => {
    const cal = getLatestCalibration(userId, exerciseName);
    setCalibration(cal);
  }, []);

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


  async function handleBack() {
    setIsRecording(false);
    setIsBaseline(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
    await ble.reset();
    // Only end the session in the DB if it was actually created
    if (sessionInsertedRef.current) {
      dbEndSession(sessionIdRef.current);
    }
    onBack();
  }

  const BASELINE_DURATION_MS = 2000;
  const EMG_KEYS = ["emg_left_tricep", "emg_left_pec", "emg_right_tricep", "emg_right_pec"] as const;

  function startRecording() {
    const setId = `set_${Date.now()}`;
    currentSetIdRef.current = setId;

    // Lazily create the session row the first time a set is started
    if (!sessionInsertedRef.current) {
      insertSession({
        sessionId: sessionIdRef.current,
        userId,
        deviceId: ble.connectedDevice?.id ?? undefined,
      });
      sessionInsertedRef.current = true;
    }

    insertSet({
      setId,
      sessionId: sessionIdRef.current,
      userId,
      label: `Set ${completedSets.length + 1}`,
    });

    repCountRef.current = 0;
    schmittStateRef.current = "low";
    emgMaRef.current.reset();
    repStartMsRef.current = 0;
    repEmgAccRef.current = [];
    repPeakRef.current = 0;
    setRepCount(0);
    setSampleCount(0);
    setSetSeconds(0);

    // Reset baseline state
    for (const k of EMG_KEYS) {
      emgOffsetRef.current[k] = 0;
      baselineSamplesRef.current[k] = [];
    }
    setBaselineProgress(0);
    setIsBaseline(true);

    const startTime = Date.now();

    ble.startLogging((batch) => {
      for (const bytes of batch) {
        const parsed = parsePacket(bytes);
        if (!parsed) continue;
        for (const k of EMG_KEYS) {
          baselineSamplesRef.current[k].push(parsed[k]);
        }
      }
    });

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setBaselineProgress(Math.min(elapsed / BASELINE_DURATION_MS, 1));

      if (elapsed >= BASELINE_DURATION_MS) {
        clearInterval(interval);
        finishBaselineAndRecord();
      }
    }, 100);
    baselineTimerRef.current = interval;
  }

  function finishBaselineAndRecord() {
    ble.stopLogging();

    // Compute mean offset per channel
    for (const k of EMG_KEYS) {
      const arr = baselineSamplesRef.current[k];
      emgOffsetRef.current[k] = arr.length > 0
        ? arr.reduce((s, v) => s + v, 0) / arr.length
        : 0;
    }

    // Persist offsets so analytics pages can apply them
    if (currentSetIdRef.current) {
      saveBaselineOffsets(currentSetIdRef.current, emgOffsetRef.current);
    }

    setIsBaseline(false);
    setIsRecording(true);
    setSetTimerRunning(true);

    ble.startLogging((batch) => {
      const sid = sessionIdRef.current;
      const setIdCurrent = currentSetIdRef.current;
      if (!setIdCurrent) return;

      let count = 0;
      for (const bytes of batch) {
        const parsed = parsePacket(bytes);
        if (parsed) {
          insertSample({ userId, sessionId: sid, setId: setIdCurrent, parsed });
          count++;

          if (mvcValue > 0) {
            const corrected = Math.max(0, parsed[calibratedChannel] - emgOffsetRef.current[calibratedChannel]);
            const emgVal = emgMaRef.current.push(corrected);

            if (schmittStateRef.current === "low" && emgVal >= upperThreshold) {
              schmittStateRef.current = "high";
              repStartMsRef.current = parsed.t_ms;
              repEmgAccRef.current = [corrected];
              repPeakRef.current = corrected;
            } else if (schmittStateRef.current === "high") {
              repEmgAccRef.current.push(corrected);
              if (corrected > repPeakRef.current) repPeakRef.current = corrected;

              if (emgVal <= lowerThreshold) {
                schmittStateRef.current = "low";
                repCountRef.current += 1;

                const acc = repEmgAccRef.current;
                const meanEmg = acc.length > 0 ? acc.reduce((s, v) => s + v, 0) / acc.length : 0;

                insertRep({
                  setId: setIdCurrent,
                  repNumber: repCountRef.current,
                  startMs: repStartMsRef.current,
                  endMs: parsed.t_ms,
                  peakEmg: repPeakRef.current,
                  meanEmg,
                });
              }
            }
          }
        }
      }
      if (count > 0) {
        setSampleCount((prev) => prev + count);
        if (mvcValue > 0) setRepCount(repCountRef.current);
      }
    });
  }

  function endRecording() {
    ble.stopLogging();
    setIsRecording(false);
    setSetTimerRunning(false);

    if (currentSetIdRef.current) {
      dbEndSet(currentSetIdRef.current);
      updateSetRepCount(currentSetIdRef.current, repCountRef.current);
    }

    const duration = Math.max(1, setSeconds);
    const setId = currentSetIdRef.current ?? `set-${Date.now()}`;
    const samples = countSamplesForSet(setId);
    setCompletedSets((prev) => [
      ...prev,
      {
        id: setId,
        durationSec: duration,
        avgForceN: 0,
        sampleCount: samples,
        repCount: repCountRef.current,
      },
    ]);
    currentSetIdRef.current = null;
    setSetSeconds(0);
  }

  async function handleEndSession() {
    if (completedSets.length === 0) return;
    setIsRecording(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    await ble.reset();

    dbEndSession(sessionIdRef.current);

    const setsCount = completedSets.length;
    const avgForce =
      setsCount === 0
        ? 0
        : Math.round(
            (completedSets.reduce((sum, s) => sum + s.avgForceN, 0) /
              setsCount) *
              10,
          ) / 10;

    onEndSession({
      id: sessionIdRef.current,
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
        <BackButton onPress={handleBack} />

        <View style={styles.inlineRow}>
          <Feather name="clock" size={16} color={colors.primary} />
          <Text
            variant="titleMedium"
            style={{ color: colors.primary, fontWeight: "900" }}
          >
            {formatMMSS(sessionSeconds)}
          </Text>
        </View>
      </View>

      <Text
        variant="titleLarge"
        style={{ color: colors.onSurface, fontWeight: "900", marginBottom: 10 }}
      >
        {exerciseName} Session
      </Text>
      <View style={[styles.divider, { backgroundColor: colors.outline }]} />

      {/* Device Connection */}
      <DeviceConnectionCard ble={ble} />

      {/* Recording / Baseline / Ready card */}
      <Card style={styles.bigCard} mode="outlined">
        <Card.Content>
          {isBaseline ? (
            <>
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <Badge style={{ backgroundColor: colors.primary }}>
                  Baseline
                </Badge>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
                <Feather name="mic-off" size={18} color={colors.primary} />
                <Text
                  variant="titleMedium"
                  style={{ color: colors.primary, fontWeight: "900" }}
                >
                  Stay completely still...
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginBottom: 12 }}
              >
                Capturing noise floor for 2 seconds
              </Text>
              <ProgressBar
                progress={baselineProgress}
                color={colors.primary}
                style={{ height: 8, borderRadius: 4 }}
              />
            </>
          ) : isRecording ? (
            <>
              <View style={{ alignItems: "center", marginBottom: 6 }}>
                <Badge style={{ backgroundColor: colors.danger }}>
                  Recording
                </Badge>
              </View>

              <Text
                variant="displaySmall"
                style={{
                  color: colors.onSurface,
                  fontWeight: "900",
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                {formatMMSS(setSeconds)}
              </Text>
              <Text
                variant="labelLarge"
                style={{
                  color: colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 2,
                  marginBottom: 12,
                }}
              >
                Set Duration
              </Text>

              {mvcValue > 0 && (
                <View style={{ alignItems: "center", marginTop: 12 }}>
                  <Text
                    variant="displayMedium"
                    style={{ color: colors.primary, fontWeight: "900" }}
                  >
                    {repCount}
                  </Text>
                  <Text
                    variant="labelLarge"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    Reps
                  </Text>
                </View>
              )}

              <Text
                variant="labelSmall"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 8 }}
              >
                {sampleCount} samples saved to DB
              </Text>

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
              <Text
                variant="titleMedium"
                style={{
                  color: colors.onSurface,
                  textAlign: "center",
                  fontWeight: "900",
                }}
              >
                Ready to start your next set?
              </Text>
              <Text
                variant="bodyMedium"
                style={{
                  color: colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Press the button below to begin recording
              </Text>
              {/* Uncomment to require EVA device connection before recording: */}
              {!ble.connectedDevice && (
                <Text
                  variant="bodySmall"
                  style={{
                    color: colors.error,
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  Please connect to an EVA device to start recording.
                </Text>
              )}
              <Button
                mode="contained"
                onPress={startRecording}
                disabled={!ble.connectedDevice}
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
        <Text
          variant="titleMedium"
          style={{ color: colors.onSurface, fontWeight: "900" }}
        >
          Completed Sets
        </Text>
        <Badge style={{ backgroundColor: colors.outline }}>
          {completedSets.length}
        </Badge>
      </View>

      {completedSets.length === 0 ? (
        <Card
          style={[styles.infoCard, { borderColor: colors.infoBorder }]}
          mode="outlined"
        >
          <Card.Content
            style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}
          >
            <Text
              variant="bodySmall"
              style={{ color: colors.infoText, textAlign: "center" }}
            >
              No sets completed yet. Start recording to begin!
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {completedSets.map((set, idx) => (
            <Card
              key={set.id}
              style={styles.setRowCard}
              mode="outlined"
              onPress={() =>
                router.push({
                  pathname: "/set/[setId]",
                  params: {
                    setId: set.id,
                    source: "sqlite",
                    ...(mvcValue > 0 ? { mvcValue: String(mvcValue) } : {}),
                  },
                })
              }
            >
              <Card.Content style={styles.setRowContent}>
                <View
                  style={[
                    styles.setNumberCircle,
                    {
                      backgroundColor: colors.infoBg,
                      borderColor: colors.infoBorder,
                    },
                  ]}
                >
                  <Text style={{ fontWeight: "900", color: colors.primary }}>
                    {idx + 1}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    variant="titleSmall"
                    style={{ color: colors.onSurface }}
                  >
                    Set {idx + 1}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
                  >
                    {set.durationSec}s · {set.sampleCount} samples{set.repCount > 0 ? ` · ${set.repCount} reps` : ""}
                  </Text>
                </View>

                <View style={styles.inlineRow}>
                  <Feather
                    name="bar-chart-2"
                    size={16}
                    color={colors.primary}
                  />
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={colors.onSurfaceVariant}
                  />
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
        textColor={
          completedSets.length === 0
            ? colors.onSurfaceVariant
            : colors.onSurface
        }
      >
        End Session
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  sessionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
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
});
