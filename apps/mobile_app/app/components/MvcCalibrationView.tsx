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

const CALIBRATION_DURATION_MS = 3000;

type Phase = "select" | "countdown" | "recording" | "done";

export default function MvcCalibrationView({
  exerciseName,
  onComplete,
  onBack,
}: MvcCalibrationViewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const ble = useBle();
  const userId = user?.id ?? "local-user";

  const [channel, setChannel] = useState<EmgChannel>("emg_left_pec");
  const [phase, setPhase] = useState<Phase>("select");
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const [peakValue, setPeakValue] = useState(0);

  const peakRef = useRef(0);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ble.stopLogging();
    };
  }, []);

  function startCountdown() {
    setPhase("countdown");
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(interval);
        startCalibration();
      }
    }, 1000);
    timerRef.current = interval;
  }

  function startCalibration() {
    peakRef.current = 0;
    startTimeRef.current = Date.now();
    setPhase("recording");
    setProgress(0);

    ble.startLogging((batch) => {
      for (const bytes of batch) {
        const parsed = parsePacket(bytes);
        if (!parsed) continue;
        const val = parsed[channel];
        if (val > peakRef.current) {
          peakRef.current = val;
          setPeakValue(val);
        }
      }
    });

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(elapsed / CALIBRATION_DURATION_MS, 1);
      setProgress(pct);

      if (elapsed >= CALIBRATION_DURATION_MS) {
        clearInterval(progressInterval);
        finishCalibration();
      }
    }, 100);
    timerRef.current = progressInterval;
  }

  function finishCalibration() {
    ble.stopLogging();
    const finalPeak = peakRef.current;
    setPeakValue(finalPeak);
    setPhase("done");

    if (finalPeak > 0) {
      saveCalibration(userId, exerciseName, channel, finalPeak);
    }
  }

  const channelLabel = CHANNELS.find((c) => c.value === channel)?.label ?? channel;

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

      {phase === "select" && (
        <>
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={{ color: colors.onSurface, marginBottom: 8 }}>
                Select EMG Channel
              </Text>
              <RadioButton.Group
                value={channel}
                onValueChange={(v) => setChannel(v as EmgChannel)}
              >
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
                Contract your {channelLabel.toLowerCase()} as hard as you can for 3 seconds.
                This records your Maximum Voluntary Contraction (MVC) for normalizing future data.
              </Text>
            </Card.Content>
          </Card>

          <Button
            mode="contained"
            onPress={startCountdown}
            icon="flash"
            style={styles.actionBtn}
            buttonColor={colors.primary}
            textColor={colors.onPrimary}
          >
            Start Calibration
          </Button>
        </>
      )}

      {phase === "countdown" && (
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
              Get ready...
            </Text>
            <Text
              variant="displayLarge"
              style={{ color: colors.primary, fontWeight: "900" }}
            >
              {countdown}
            </Text>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
              Prepare to contract your {channelLabel.toLowerCase()}
            </Text>
          </Card.Content>
        </Card>
      )}

      {phase === "recording" && (
        <Card style={styles.card} mode="outlined">
          <Card.Content style={{ paddingVertical: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Feather name="activity" size={20} color={colors.error} />
              <Text variant="titleMedium" style={{ color: colors.error, fontWeight: "900" }}>
                RECORDING — FLEX NOW!
              </Text>
            </View>

            <ProgressBar progress={progress} color={colors.primary} style={{ height: 8, borderRadius: 4, marginBottom: 16 }} />

            <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
              Channel: {channelLabel}
            </Text>
            <Text variant="displaySmall" style={{ color: colors.onSurface, fontWeight: "900" }}>
              Peak: {peakValue.toFixed(4)}
            </Text>
          </Card.Content>
        </Card>
      )}

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
              <Text
                variant="displaySmall"
                style={{ color: colors.primary, fontWeight: "900", marginTop: 8 }}
              >
                MVC: {peakValue.toFixed(4)}
              </Text>
              {peakValue === 0 && (
                <Text variant="bodySmall" style={{ color: colors.error, marginTop: 8 }}>
                  No data received. Make sure the device is sending data.
                </Text>
              )}
            </Card.Content>
          </Card>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              mode="outlined"
              onPress={() => { setPhase("select"); setPeakValue(0); }}
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
});
