import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, Button, ProgressBar, RadioButton } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import { useBle } from "../hooks/useBle";
import { parsePacket, saveCalibration, type EmgChannel } from "../sqlite/bleDb";
import DeviceConnectionCard from "./DeviceConnectionCard";
import BackButton from "./BackButton";

interface MvcCalibrationViewProps {
  exerciseName: string;
  onComplete: () => void;
  onBack: () => void;
}

const CHANNELS: { value: EmgChannel; label: string }[] = [
  { value: "emg_left_tricep", label: "Left Tricep" },
  { value: "emg_left_pec", label: "Left Pec" },
  { value: "emg_right_tricep", label: "Right Tricep" },
  { value: "emg_right_pec", label: "Right Pec" },
];

const ALL_CHANNELS: EmgChannel[] = [
  "emg_left_tricep",
  "emg_left_pec",
  "emg_right_tricep",
  "emg_right_pec",
];

type ChannelMode = EmgChannel | "all";

const BASELINE_DURATION_MS = 2000;
const PUSH_DURATION_MS = 5000;
const RMS_WINDOW_SIZE = 100; // 1 second at 100 Hz

type Phase = "select" | "baseline" | "countdown" | "push" | "done";

/**
 * Sliding-window RMS tracker. Maintains a circular buffer of the last
 * `windowSize` samples and computes the RMS on each push. Tracks the
 * highest RMS window seen so far.
 */
class RmsWindowTracker {
  private buf: number[];
  private sumSq = 0;
  private idx = 0;
  private count = 0;
  private _peakRms = 0;
  readonly windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = Math.max(1, windowSize);
    this.buf = new Array(this.windowSize).fill(0);
  }

  push(value: number): number {
    const sq = value * value;
    if (this.count >= this.windowSize) {
      this.sumSq -= this.buf[this.idx];
    }
    this.buf[this.idx] = sq;
    this.sumSq += sq;
    this.idx = (this.idx + 1) % this.windowSize;
    this.count = Math.min(this.count + 1, this.windowSize);

    const rms = Math.sqrt(this.sumSq / this.count);
    if (this.count >= this.windowSize && rms > this._peakRms) {
      this._peakRms = rms;
    }
    return rms;
  }

  get peakRms() {
    return this._peakRms;
  }

  reset() {
    this.buf.fill(0);
    this.sumSq = 0;
    this.idx = 0;
    this.count = 0;
    this._peakRms = 0;
  }
}

export default function MvcCalibrationView({
  exerciseName,
  onComplete,
  onBack,
}: MvcCalibrationViewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const ble = useBle();
  const userId = user?.id ?? "local-user";

  const [channelMode, setChannelMode] = useState<ChannelMode>("all");
  const [phase, setPhase] = useState<Phase>("select");
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const [baselineRms, setBaselineRms] = useState(0);
  const [baselineRmsAll, setBaselineRmsAll] = useState<Record<EmgChannel, number>>({
    emg_left_tricep: 0,
    emg_left_pec: 0,
    emg_right_tricep: 0,
    emg_right_pec: 0,
  });
  const [currentRms, setCurrentRms] = useState(0);
  const [peakRmsValue, setPeakRmsValue] = useState(0);
  const [mvcResult, setMvcResult] = useState(0);
  const [mvcResultAll, setMvcResultAll] = useState<Record<EmgChannel, number>>({
    emg_left_tricep: 0,
    emg_left_pec: 0,
    emg_right_tricep: 0,
    emg_right_pec: 0,
  });

  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAllMode = channelMode === "all";

  // Baseline: collect samples per channel
  const baselineSamplesRef = useRef<Record<EmgChannel, number[]>>({
    emg_left_tricep: [],
    emg_left_pec: [],
    emg_right_tricep: [],
    emg_right_pec: [],
  });

  // Store baseline RMS per channel (used in finishPush – state may not be updated yet)
  const baselineRmsRef = useRef<Record<EmgChannel, number>>({
    emg_left_tricep: 0,
    emg_left_pec: 0,
    emg_right_tricep: 0,
    emg_right_pec: 0,
  });

  // Push: one RMS tracker per channel
  const rmsTrackersRef = useRef<Record<EmgChannel, RmsWindowTracker>>({
    emg_left_tricep: new RmsWindowTracker(RMS_WINDOW_SIZE),
    emg_left_pec: new RmsWindowTracker(RMS_WINDOW_SIZE),
    emg_right_tricep: new RmsWindowTracker(RMS_WINDOW_SIZE),
    emg_right_pec: new RmsWindowTracker(RMS_WINDOW_SIZE),
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ble.stopLogging();
    };
  }, []);

  // ── Phase 1: Baseline (2s, stay still) ──────────────────────────
  function startBaseline() {
    for (const ch of ALL_CHANNELS) {
      baselineSamplesRef.current[ch] = [];
    }
    startTimeRef.current = Date.now();
    setPhase("baseline");
    setProgress(0);

    ble.startLogging((batch) => {
      for (const bytes of batch) {
        const parsed = parsePacket(bytes);
        if (!parsed) continue;
        for (const ch of ALL_CHANNELS) {
          baselineSamplesRef.current[ch].push(parsed[ch]);
        }
      }
    });

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / BASELINE_DURATION_MS, 1);
      setProgress(pct);

      if (elapsed >= BASELINE_DURATION_MS) {
        clearInterval(interval);
        finishBaseline();
      }
    }, 100);
    timerRef.current = interval;
  }

  function finishBaseline() {
    ble.stopLogging();
    const baselines: Record<EmgChannel, number> = {
      emg_left_tricep: 0,
      emg_left_pec: 0,
      emg_right_tricep: 0,
      emg_right_pec: 0,
    };
    for (const ch of ALL_CHANNELS) {
      const samples = baselineSamplesRef.current[ch];
      if (samples.length > 0) {
        const sumSq = samples.reduce((s, v) => s + v * v, 0);
        baselines[ch] = Math.sqrt(sumSq / samples.length);
      }
    }
    baselineRmsRef.current = baselines;
    setBaselineRmsAll(baselines);
    setBaselineRms(isAllMode ? baselines.emg_left_pec : baselines[channelMode as EmgChannel]);
    startCountdown();
  }

  // ── Phase 2: Countdown (3-2-1) ─────────────────────────────────
  function startCountdown() {
    setPhase("countdown");
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        startPush();
      }
    }, 1000);
    timerRef.current = interval;
  }

  // ── Phase 3: Push (5s, max contraction) ─────────────────────────
  function startPush() {
    for (const ch of ALL_CHANNELS) {
      rmsTrackersRef.current[ch].reset();
    }
    startTimeRef.current = Date.now();
    setPhase("push");
    setProgress(0);
    setCurrentRms(0);

    ble.startLogging((batch) => {
      for (const bytes of batch) {
        const parsed = parsePacket(bytes);
        if (!parsed) continue;
        let maxRms = 0;
        for (const ch of ALL_CHANNELS) {
          const rms = rmsTrackersRef.current[ch].push(parsed[ch]);
          if (rms > maxRms) maxRms = rms;
        }
        setCurrentRms(maxRms);
        const maxPeak = Math.max(...ALL_CHANNELS.map((ch) => rmsTrackersRef.current[ch].peakRms));
        setPeakRmsValue(maxPeak);
      }
    });

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / PUSH_DURATION_MS, 1);
      setProgress(pct);

      if (elapsed >= PUSH_DURATION_MS) {
        clearInterval(interval);
        finishPush();
      }
    }, 100);
    timerRef.current = interval;
  }

  function finishPush() {
    ble.stopLogging();
    const baselines = baselineRmsRef.current;
    const results: Record<EmgChannel, number> = {
      emg_left_tricep: 0,
      emg_left_pec: 0,
      emg_right_tricep: 0,
      emg_right_pec: 0,
    };
    for (const ch of ALL_CHANNELS) {
      const rawPeak = rmsTrackersRef.current[ch].peakRms;
      results[ch] = Math.max(0, rawPeak - baselines[ch]);
      if (results[ch] > 0) {
        saveCalibration(userId, exerciseName, ch, results[ch]);
      }
    }
    setMvcResultAll(results);
    setPeakRmsValue(
      Math.max(...ALL_CHANNELS.map((ch) => rmsTrackersRef.current[ch].peakRms)),
    );
    if (isAllMode) {
      setMvcResult(results.emg_left_pec);
    } else {
      setMvcResult(results[channelMode as EmgChannel]);
    }
    setPhase("done");
  }

  // ── Helpers ─────────────────────────────────────────────────────
  function resetAll() {
    setPhase("select");
    setProgress(0);
    setBaselineRms(0);
    setBaselineRmsAll({
      emg_left_tricep: 0,
      emg_left_pec: 0,
      emg_right_tricep: 0,
      emg_right_pec: 0,
    });
    setCurrentRms(0);
    setPeakRmsValue(0);
    setMvcResult(0);
    setMvcResultAll({
      emg_left_tricep: 0,
      emg_left_pec: 0,
      emg_right_tricep: 0,
      emg_right_pec: 0,
    });
  }

  const channelLabel = isAllMode
    ? "All channels"
    : CHANNELS.find((c) => c.value === channelMode)?.label ?? channelMode;

  // ── Render ──────────────────────────────────────────────────────
  if (!ble.connectedDevice) {
    return (
      <>
        <BackButton onPress={onBack} label="Back to Overview" />
        <Text
          variant="headlineSmall"
          style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6, marginBottom: 16 }}
        >
          MVC Calibration
        </Text>
        <DeviceConnectionCard ble={ble} />
      </>
    );
  }

  return (
    <>
      <BackButton onPress={onBack} label="Back to Overview" />
      <Text
        variant="headlineSmall"
        style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6, marginBottom: 4 }}
      >
        MVC Calibration
      </Text>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginBottom: 16 }}>
        {exerciseName}
      </Text>

      {/* ── SELECT CHANNEL ─────────────────────────────────────── */}
      {phase === "select" && (
        <>
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={{ color: colors.onSurface, marginBottom: 8 }}>
                Select calibration mode
              </Text>
              <RadioButton.Group
                value={channelMode}
                onValueChange={(v) => setChannelMode(v as ChannelMode)}
              >
                <RadioButton.Item
                  key="all"
                  label="All channels (recommended – calibrate all 4 at once)"
                  value="all"
                  labelStyle={{ color: colors.onSurface }}
                />
                {CHANNELS.map((ch) => (
                  <RadioButton.Item
                    key={ch.value}
                    label={ch.label}
                    value={ch.value}
                    labelStyle={{ color: colors.onSurface }}
                  />
                ))}
              </RadioButton.Group>
            </Card.Content>
          </Card>

          <Card style={[styles.card, { borderColor: colors.infoBorder }]} mode="outlined">
            <Card.Content style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}>
              <Text variant="bodySmall" style={{ color: colors.infoText }}>
                The calibration has three steps:{"\n\n"}
                1. Stay completely still for 2 seconds (baseline noise capture).{"\n"}
                2. Get ready during a 3-second countdown.{"\n"}
                3. Push as hard as you can for 5 seconds against a fixed bar.{"\n\n"}
                Your MVC is the peak 1-second RMS window minus the baseline noise.
              </Text>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={startBaseline}
            icon="flash"
            style={styles.actionBtn}
            buttonColor={colors.primary}
            textColor={colors.onPrimary}
          >
            Start Calibration
          </Button>
        </>
      )}

      {/* ── BASELINE (2s, stay still) ──────────────────────────── */}
      {phase === "baseline" && (
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ paddingVertical: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Feather name="mic-off" size={20} color={colors.primary} />
              <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                STAY COMPLETELY STILL
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginBottom: 12 }}>
              Recording baseline noise{isAllMode ? " for all channels" : ` for ${channelLabel.toLowerCase()}`}...
            </Text>
            <ProgressBar
              progress={progress}
              color={colors.primary}
              style={{ height: 8, borderRadius: 4 }}
            />
          </Card.Content>
        </Card>
      )}

      {/* ── COUNTDOWN (3-2-1) ──────────────────────────────────── */}
      {phase === "countdown" && (
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
              {isAllMode
                ? "Baseline captured for all channels"
                : `Baseline captured (${baselineRms.toFixed(4)})`}
            </Text>
            <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8, fontWeight: "700" }}>
              Get ready to push...
            </Text>
            <Text
              variant="displayLarge"
              style={{ color: colors.primary, fontWeight: "900" }}
            >
              {countdown}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
              {isAllMode
                ? "Contract all target muscles as hard as you can"
                : `Contract your ${channelLabel.toLowerCase()} as hard as you can`}
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* ── PUSH (5s, max contraction) ─────────────────────────── */}
      {phase === "push" && (
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ paddingVertical: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Feather name="activity" size={20} color={colors.error} />
              <Text variant="titleMedium" style={{ color: colors.error, fontWeight: "900" }}>
                PUSH AS HARD AS YOU CAN!
              </Text>
            </View>

            <ProgressBar
              progress={progress}
              color={colors.error}
              style={{ height: 8, borderRadius: 4, marginBottom: 16 }}
            />

            <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
              Mode: {channelLabel}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <View>
                <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                  Current RMS
                </Text>
                <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "900" }}>
                  {currentRms.toFixed(4)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                  Peak 1s RMS
                </Text>
                <Text variant="titleLarge" style={{ color: colors.primary, fontWeight: "900" }}>
                  {peakRmsValue.toFixed(4)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* ── DONE ───────────────────────────────────────────────── */}
      {phase === "done" && (
        <>
          <Card style={styles.card} mode="outlined">
            <Card.Content style={{ paddingVertical: 24, alignItems: "center" }}>
              <Feather name="check-circle" size={40} color={colors.success} />
              <Text
                variant="titleLarge"
                style={{ color: colors.onSurface, fontWeight: "900", marginTop: 12 }}
              >
                Calibration Complete
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                {channelLabel}
              </Text>

              <View style={{ width: "100%", marginTop: 16, gap: 8 }}>
                {isAllMode ? (
                  ALL_CHANNELS.map((ch) => {
                    const label = CHANNELS.find((c) => c.value === ch)?.label ?? ch;
                    const mvc = mvcResultAll[ch];
                    const baseline = baselineRmsAll[ch];
                    return (
                      <View key={ch} style={styles.doneRow}>
                        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                          {label}
                        </Text>
                        <Text variant="bodyMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
                          MVC: {mvc.toFixed(4)} (baseline: {baseline.toFixed(4)})
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                        Baseline RMS (noise)
                      </Text>
                      <Text variant="bodyMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
                        {baselineRms.toFixed(4)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                        Peak 1s RMS (raw)
                      </Text>
                      <Text variant="bodyMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
                        {peakRmsValue.toFixed(4)}
                      </Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: colors.outline, marginVertical: 4 }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                        MVC (peak − baseline)
                      </Text>
                      <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                        {mvcResult.toFixed(4)}
                      </Text>
                    </View>
                  </>
                )}

                {!isAllMode && mvcResult === 0 && (
                  <Text variant="bodySmall" style={{ color: colors.error, marginTop: 8 }}>
                    No usable signal detected. Make sure the device is sending data.
                  </Text>
                )}
                {isAllMode && Object.values(mvcResultAll).every((v) => v === 0) && (
                  <Text variant="bodySmall" style={{ color: colors.error, marginTop: 8 }}>
                    No usable signal detected. Make sure the device is sending data.
                  </Text>
                )}
              </View>
            </Card.Content>
          </Card>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              mode="outlined"
              onPress={resetAll}
              style={{ flex: 1 }}
            >
              Recalibrate
            </Button>
            <Button
              mode="contained"
              onPress={onComplete}
              style={{ flex: 1 }}
              buttonColor={colors.primary}
              textColor={colors.onPrimary}
            >
              Done
            </Button>
          </View>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, marginBottom: 16 },
  actionBtn: { borderRadius: 10, marginTop: 4 },
  doneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
});
