import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Alert } from "react-native";
import {
  initBleDb,
  listAllSamplesForSet,
  getBaselineOffsets,
  getLatestCalibration,
  type SampleRow,
} from "../sqlite/bleDb";

const CSV_COLUMNS = [
  "t_ms",
  "emg_left_tricep",
  "emg_left_pec",
  "emg_right_tricep",
  "emg_right_pec",
  "l_accx",
  "l_accy",
  "l_accz",
  "l_roll",
  "l_pitch",
  "l_yaw",
  "r_accx",
  "r_accy",
  "r_accz",
  "r_roll",
  "r_pitch",
  "r_yaw",
] as const;

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function rowToCsvLine(row: SampleRow): string {
  return CSV_COLUMNS.map((col) => row[col] ?? "").join(",");
}

/**
 * Write the raw (unprocessed) samples for a set to a CSV file.
 * Returns the file URI.
 */
export async function exportRawCsv(
  setId: string,
  setLabel: string,
): Promise<string> {
  initBleDb();
  const samples = listAllSamplesForSet(setId);
  const header = CSV_COLUMNS.join(",");
  const lines = [header, ...samples.map(rowToCsvLine)];
  const csv = lines.join("\n");

  const fileName = `${sanitizeLabel(setLabel)}_raw.csv`;
  const fileUri = FileSystem.documentDirectory + fileName;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return fileUri;
}

/**
 * Write the processed samples for a set to a CSV file.
 * EMG channels have baseline subtracted and (if MVC available) are normalized to %MVC.
 * IMU values are unchanged.
 * Returns the file URI.
 */
export async function exportProcessedCsv(
  setId: string,
  setLabel: string,
  userId?: string,
  exerciseName?: string,
): Promise<string> {
  initBleDb();
  const samples = listAllSamplesForSet(setId);
  const baseline = getBaselineOffsets(setId);

  let mvc = 0;
  if (userId && exerciseName) {
    const cal = getLatestCalibration(userId, exerciseName);
    if (cal) mvc = cal.mvc_value;
  }

  const header = CSV_COLUMNS.join(",");
  const lines = [header];

  for (const row of samples) {
    const corrected = {
      emg_left_tricep: Math.max(0, (row.emg_left_tricep ?? 0) - baseline.emg_left_tricep),
      emg_left_pec: Math.max(0, (row.emg_left_pec ?? 0) - baseline.emg_left_pec),
      emg_right_tricep: Math.max(0, (row.emg_right_tricep ?? 0) - baseline.emg_right_tricep),
      emg_right_pec: Math.max(0, (row.emg_right_pec ?? 0) - baseline.emg_right_pec),
    };

    const emg = mvc > 0
      ? {
          emg_left_tricep: (corrected.emg_left_tricep / mvc) * 100,
          emg_left_pec: (corrected.emg_left_pec / mvc) * 100,
          emg_right_tricep: (corrected.emg_right_tricep / mvc) * 100,
          emg_right_pec: (corrected.emg_right_pec / mvc) * 100,
        }
      : corrected;

    const vals = [
      row.t_ms,
      emg.emg_left_tricep,
      emg.emg_left_pec,
      emg.emg_right_tricep,
      emg.emg_right_pec,
      row.l_accx ?? "",
      row.l_accy ?? "",
      row.l_accz ?? "",
      row.l_roll ?? "",
      row.l_pitch ?? "",
      row.l_yaw ?? "",
      row.r_accx ?? "",
      row.r_accy ?? "",
      row.r_accz ?? "",
      row.r_roll ?? "",
      row.r_pitch ?? "",
      row.r_yaw ?? "",
    ];
    lines.push(vals.join(","));
  }

  const csv = lines.join("\n");
  const fileName = `${sanitizeLabel(setLabel)}_processed.csv`;
  const fileUri = FileSystem.documentDirectory + fileName;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return fileUri;
}

/**
 * Export all sets in a session as raw + processed CSVs, then open the share sheet.
 */
export async function exportSessionCsvs(
  setsInfo: { id: string; label: string }[],
  userId?: string,
  exerciseName?: string,
): Promise<void> {
  try {
    const filePaths: string[] = [];

    for (const set of setsInfo) {
      const rawPath = await exportRawCsv(set.id, set.label);
      const processedPath = await exportProcessedCsv(
        set.id,
        set.label,
        userId,
        exerciseName,
      );
      filePaths.push(rawPath, processedPath);
    }

    if (filePaths.length === 0) {
      Alert.alert("Export", "No data to export.");
      return;
    }

    // Share files sequentially (iOS share sheet handles one file at a time)
    for (const path of filePaths) {
      await Sharing.shareAsync(path, {
        mimeType: "text/csv",
        UTI: "public.comma-separated-values-text",
      });
    }
  } catch (e: any) {
    Alert.alert("Export Failed", e?.message ?? "Unknown error");
  }
}
