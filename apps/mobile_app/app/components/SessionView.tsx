import React, { useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, Button, Badge, ProgressBar } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import { useBle } from "../hooks/useBle";
import { formatMMSS } from "../utils/format";
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
  saveBaselineOffsets,
  insertRep,
  updateSetRepCount,
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
  /** Pre-recording: EMG baseline (3s), then get into position (3s). */
  const [isWarmup, setIsWarmup] = useState(false);
  const [warmupPhase, setWarmupPhase] = useState<1 | 2>(1);
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [setSeconds, setSetSeconds] = useState(0);
  const [setTimerRunning, setSetTimerRunning] = useState(false);
  const [completedSets, setCompletedSets] = useState<SetRecord[]>([]);

  // Baseline offset per EMG channel (subtracted from every sample)
  const emgOffsetRef = useRef({ emg_left_tricep: 0, emg_left_pec: 0, emg_right_tricep: 0, emg_right_pec: 0 });
  const baselineSamplesRef = useRef<{ emg_left_tricep: number[]; emg_left_pec: number[]; emg_right_tricep: number[]; emg_right_pec: number[] }>({ emg_left_tricep: [], emg_left_pec: [], emg_right_tricep: [], emg_right_pec: [] });
  const baselineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** EMG channel used for per-rep peak/mean in the DB. */
  const calibratedChannel: EmgChannel = "emg_left_pec";

  /** Rep period in real time (wall clock). Device `t_ms` is only used for DB start/end stamps. */
  const REP_DURATION_MS = 3000;

  const [repCount, setRepCount] = useState(0);
  const repCountRef = useRef(0);

  const lastSampleTmsRef = useRef(0);
  /** Device `t_ms` at first sample of the current rep window (after last flush). */
  const repDeviceStartMsRef = useRef(0);

  const repEmgAccRef = useRef<number[]>([]);
  const repPeakEmgRef = useRef(0);
  /** Wall-clock rep ticks (every REP_DURATION_MS while recording). */
  const repWallIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setIsWarmup(false);
    setWarmupPhase(1);
    setWarmupProgress(0);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    if (baselineTimerRef.current) clearInterval(baselineTimerRef.current);
    if (repWallIntervalRef.current) {
      clearInterval(repWallIntervalRef.current);
      repWallIntervalRef.current = null;
    }
    await ble.reset();
    // Only end the session in the DB if it was actually created
    if (sessionInsertedRef.current) {
      dbEndSession(sessionIdRef.current);
    }
    onBack();
  }

  const EMG_STILL_MS = 3000;
  const GET_INTO_POSITION_MS = 3000;
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
        label: exerciseName,
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
    repDeviceStartMsRef.current = 0;
    lastSampleTmsRef.current = 0;
    repEmgAccRef.current = [];
    repPeakEmgRef.current = 0;
    if (repWallIntervalRef.current) {
      clearInterval(repWallIntervalRef.current);
      repWallIntervalRef.current = null;
    }
    setRepCount(0);
    setSampleCount(0);
    setSetSeconds(0);

    // Reset baseline state
    for (const k of EMG_KEYS) {
      emgOffsetRef.current[k] = 0;
      baselineSamplesRef.current[k] = [];
    }
    setWarmupProgress(0);
    setWarmupPhase(1);
    setIsWarmup(true);

    startWarmupEmgStill();
  }

  /** Phase 1: stay still — EMG baseline only. */
  function startWarmupEmgStill() {
    setWarmupPhase(1);
    setWarmupProgress(0);
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
      setWarmupProgress(Math.min(elapsed / EMG_STILL_MS, 1));
      if (elapsed >= EMG_STILL_MS) {
        clearInterval(interval);
        baselineTimerRef.current = null;
        finishWarmupPhase1AndStartPositionDelay();
      }
    }, 100);
    baselineTimerRef.current = interval;
  }

  /** After EMG baseline: apply offsets, then 3s delay to get into position (no logging to set). */
  function finishWarmupPhase1AndStartPositionDelay() {
    ble.stopLogging();

    for (const k of EMG_KEYS) {
      const arr = baselineSamplesRef.current[k];
      emgOffsetRef.current[k] = arr.length > 0
        ? arr.reduce((s, v) => s + v, 0) / arr.length
        : 0;
    }

    if (currentSetIdRef.current) {
      saveBaselineOffsets(currentSetIdRef.current, emgOffsetRef.current);
    }

    setWarmupPhase(2);
    setWarmupProgress(0);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setWarmupProgress(Math.min(elapsed / GET_INTO_POSITION_MS, 1));
      if (elapsed >= GET_INTO_POSITION_MS) {
        clearInterval(interval);
        baselineTimerRef.current = null;
        startRecordingAfterWarmup();
      }
    }, 100);
    baselineTimerRef.current = interval;
  }

  /** Close current rep window (every REP_DURATION_MS wall time) and persist to DB. */
  function flushRepFromWallClock(setIdCurrent: string) {
    const acc = repEmgAccRef.current;
    const endMs = lastSampleTmsRef.current;
    const startMs =
      acc.length > 0 ? repDeviceStartMsRef.current : endMs;
    const meanEmg =
      acc.length > 0 ? acc.reduce((s, v) => s + v, 0) / acc.length : 0;
    const peakEmg = acc.length > 0 ? repPeakEmgRef.current : 0;

    repCountRef.current += 1;
    insertRep({
      setId: setIdCurrent,
      repNumber: repCountRef.current,
      startMs,
      endMs,
      peakEmg,
      meanEmg,
    });
    repEmgAccRef.current = [];
    repPeakEmgRef.current = 0;
    setRepCount(repCountRef.current);
  }

  /** After position delay: start logging samples; reps advance every REP_DURATION_MS (wall clock). */
  function startRecordingAfterWarmup() {
    lastSampleTmsRef.current = 0;
    repDeviceStartMsRef.current = 0;
    repEmgAccRef.current = [];
    repPeakEmgRef.current = 0;

    setIsWarmup(false);
    setIsRecording(true);
    setSetTimerRunning(true);

    if (repWallIntervalRef.current) {
      clearInterval(repWallIntervalRef.current);
      repWallIntervalRef.current = null;
    }

    const setIdForReps = currentSetIdRef.current;
    if (setIdForReps) {
      repWallIntervalRef.current = setInterval(() => {
        const setIdCurrent = currentSetIdRef.current;
        if (!setIdCurrent) return;
        flushRepFromWallClock(setIdCurrent);
      }, REP_DURATION_MS);
    }

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
          lastSampleTmsRef.current = parsed.t_ms;

          if (repEmgAccRef.current.length === 0) {
            repDeviceStartMsRef.current = parsed.t_ms;
            repPeakEmgRef.current = 0;
          }

          const correctedEmg = Math.max(
            0,
            parsed[calibratedChannel] - emgOffsetRef.current[calibratedChannel],
          );
          repEmgAccRef.current.push(correctedEmg);
          if (correctedEmg > repPeakEmgRef.current) {
            repPeakEmgRef.current = correctedEmg;
          }
        }
      }
      if (count > 0) {
        setSampleCount((prev) => prev + count);
      }
    });
  }

  function flushPartialRepIfAny(setIdCurrent: string) {
    if (repEmgAccRef.current.length === 0) return;
    const endMs = lastSampleTmsRef.current;
    const repStartMs = repDeviceStartMsRef.current;
    const acc = repEmgAccRef.current;
    const meanEmg =
      acc.length > 0 ? acc.reduce((s, v) => s + v, 0) / acc.length : 0;
    repCountRef.current += 1;
    insertRep({
      setId: setIdCurrent,
      repNumber: repCountRef.current,
      startMs: repStartMs,
      endMs,
      peakEmg: repPeakEmgRef.current,
      meanEmg,
    });
    repEmgAccRef.current = [];
    repPeakEmgRef.current = 0;
    setRepCount(repCountRef.current);
  }

  function endRecording() {
    const setIdCurrent = currentSetIdRef.current;
    if (repWallIntervalRef.current) {
      clearInterval(repWallIntervalRef.current);
      repWallIntervalRef.current = null;
    }
    if (setIdCurrent) {
      flushPartialRepIfAny(setIdCurrent);
    }
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
          {isWarmup ? (
            <>
              <View style={{ alignItems: "center", marginBottom: 12 }}>
                <Badge style={{ backgroundColor: colors.primary }}>
                  {warmupPhase === 1 ? "Step 1 of 3" : "Step 2 of 3"}
                </Badge>
              </View>
              {warmupPhase === 1 ? (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Feather name="mic-off" size={18} color={colors.primary} />
                    <Text
                      variant="titleMedium"
                      style={{ color: colors.primary, fontWeight: "900" }}
                    >
                      Don&apos;t move
                    </Text>
                  </View>
                  <Text
                    variant="bodySmall"
                    style={{
                      color: colors.onSurfaceVariant,
                      textAlign: "center",
                      marginBottom: 12,
                    }}
                  >
                    Stay still for 3 seconds while we measure your EMG baseline.
                  </Text>
                </>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Feather name="target" size={18} color={colors.primary} />
                    <Text
                      variant="titleMedium"
                      style={{ color: colors.primary, fontWeight: "900" }}
                    >
                      Get into position
                    </Text>
                  </View>
                  <Text
                    variant="bodySmall"
                    style={{
                      color: colors.onSurfaceVariant,
                      textAlign: "center",
                      marginBottom: 12,
                    }}
                  >
                    You have 3 seconds to get ready for {exerciseName}. Recording will start
                    when the bar completes.
                  </Text>
                </>
              )}
              <ProgressBar
                progress={warmupProgress}
                color={colors.primary}
                style={{ height: 8, borderRadius: 4 }}
              />
            </>
          ) : isRecording ? (
            <>
              <View style={{ alignItems: "center", marginBottom: 6 }}>
                <Badge style={{ backgroundColor: colors.danger }}>Step 3 — Recording</Badge>
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

              <Text
                variant="labelSmall"
                style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 8 }}
              >
                {sampleCount} samples
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
                Ready to record?
              </Text>
              <Text
                variant="bodySmall"
                style={{
                  color: colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Tap to start
              </Text>
              <Button
                mode="contained"
                onPress={startRecording}
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
              No sets yet. Start recording.
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
