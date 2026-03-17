import * as SQLite from "expo-sqlite";

// ─── WorkoutDataPacket_t mapping (36 bytes) ───
//
//  Bytes 0-3:   uint32_t  timestamp_ms
//  Bytes 4-5:   int16_t   left_tricep
//  Bytes 6-7:   int16_t   left_pec
//  Bytes 8-9:   int16_t   right_tricep
//  Bytes 10-11: int16_t   right_pec
//  Bytes 12-13: int16_t   left_acc_x
//  Bytes 14-15: int16_t   left_acc_y
//  Bytes 16-17: int16_t   left_acc_z
//  Bytes 18-19: int16_t   left_roll    (centidegrees ×100)
//  Bytes 20-21: int16_t   left_pitch   (centidegrees ×100)
//  Bytes 22-23: int16_t   left_yaw     (centidegrees ×100)
//  Bytes 24-25: int16_t   right_acc_x
//  Bytes 26-27: int16_t   right_acc_y
//  Bytes 28-29: int16_t   right_acc_z
//  Bytes 30-31: int16_t   right_roll   (centidegrees ×100)
//  Bytes 32-33: int16_t   right_pitch  (centidegrees ×100)
//  Bytes 34-35: int16_t   right_yaw    (centidegrees ×100)

export const PACKET_SIZE = 36;

export type ParsedSample = {
  t_ms: number;

  emg_left_tricep: number;
  emg_left_pec: number;
  emg_right_tricep: number;
  emg_right_pec: number;

  l_accx: number; l_accy: number; l_accz: number;
  l_roll: number; l_pitch: number; l_yaw: number;

  r_accx: number; r_accy: number; r_accz: number;
  r_roll: number; r_pitch: number; r_yaw: number;
};

export type SessionRow = {
  id: string;
  user_id: string;
  device_id: string | null;
  label: string | null;
  started_at: number;
  ended_at: number | null;
};

export type SetRow = {
  id: string;
  session_id: string;
  user_id: string;
  label: string | null;
  started_at: number;
  ended_at: number | null;
  baseline_emg_left_tricep: number | null;
  baseline_emg_left_pec: number | null;
  baseline_emg_right_tricep: number | null;
  baseline_emg_right_pec: number | null;
  rep_count: number | null;
};

export type SampleRow = {
  id: number;
  session_id: string;
  set_id: string;
  user_id: string;

  t_ms: number;

  emg_left_tricep: number | null;
  emg_left_pec: number | null;
  emg_right_tricep: number | null;
  emg_right_pec: number | null;

  l_accx: number | null; l_accy: number | null; l_accz: number | null;
  l_roll: number | null; l_pitch: number | null; l_yaw: number | null;

  r_accx: number | null; r_accy: number | null; r_accz: number | null;
  r_roll: number | null; r_pitch: number | null; r_yaw: number | null;

  received_at: number;
  service_uuid: string | null;
  characteristic_uuid: string | null;
};

export type EmgChannel =
  | "emg_left_tricep"
  | "emg_left_pec"
  | "emg_right_tricep"
  | "emg_right_pec";

export type CalibrationRow = {
  id: number;
  user_id: string;
  exercise_name: string;
  emg_channel: EmgChannel;
  mvc_value: number;
  calibrated_at: number;
};

let db: SQLite.SQLiteDatabase | null = null;

function getDb() {
  if (!db) db = SQLite.openDatabaseSync("ble.db");
  return db;
}

/**
 * Create tables + indexes. Call once on app start.
 *
 * If you previously had the old schema (l_gyrx/l_gyry/l_gyrz columns),
 * call clearBleDb() once or uninstall the app to reset.
 */
export function initBleDb() {
  const db = getDb();

  // Migrate from old schema: if samples table has l_gyrx instead of l_roll, drop it
  // Migrate: old samples schema (l_gyrx -> l_roll)
  const sampleCols = db.getAllSync<{ name: string }>(`PRAGMA table_info(samples)`);
  if (sampleCols.some((c) => c.name === "l_gyrx")) {
    db.execSync(`DROP TABLE IF EXISTS samples`);
  }

  // Migrate: add label column to sessions if missing
  const sessionCols = db.getAllSync<{ name: string }>(`PRAGMA table_info(sessions)`);
  if (sessionCols.length > 0 && !sessionCols.some((c) => c.name === "label")) {
    db.execSync(`ALTER TABLE sessions ADD COLUMN label TEXT`);
  }

  db.execSync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      label TEXT,
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
      baseline_emg_left_tricep REAL DEFAULT 0,
      baseline_emg_left_pec REAL DEFAULT 0,
      baseline_emg_right_tricep REAL DEFAULT 0,
      baseline_emg_right_pec REAL DEFAULT 0,
      rep_count INTEGER DEFAULT 0,
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
      l_roll INTEGER, l_pitch INTEGER, l_yaw INTEGER,

      r_accx INTEGER, r_accy INTEGER, r_accz INTEGER,
      r_roll INTEGER, r_pitch INTEGER, r_yaw INTEGER,

      received_at INTEGER NOT NULL,
      service_uuid TEXT,
      characteristic_uuid TEXT,

      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_samples_set_time ON samples(set_id, t_ms);
    CREATE INDEX IF NOT EXISTS idx_samples_session_time ON samples(session_id, t_ms);
    CREATE INDEX IF NOT EXISTS idx_samples_user_time ON samples(user_id, t_ms);

    CREATE TABLE IF NOT EXISTS reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_id TEXT NOT NULL,
      rep_number INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER,
      peak_emg REAL,
      mean_emg REAL,
      FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_reps_set ON reps(set_id);

    CREATE TABLE IF NOT EXISTS calibrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      emg_channel TEXT NOT NULL,
      mvc_value REAL NOT NULL,
      calibrated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_calibrations_user_exercise
      ON calibrations(user_id, exercise_name);
  `);

  // Migrations for columns added after initial schema
  const migrate = (sql: string) => {
    try { db.runSync(sql); } catch { /* column already exists */ }
  };
  migrate(`ALTER TABLE sets ADD COLUMN baseline_emg_left_tricep REAL DEFAULT 0`);
  migrate(`ALTER TABLE sets ADD COLUMN baseline_emg_left_pec REAL DEFAULT 0`);
  migrate(`ALTER TABLE sets ADD COLUMN baseline_emg_right_tricep REAL DEFAULT 0`);
  migrate(`ALTER TABLE sets ADD COLUMN baseline_emg_right_pec REAL DEFAULT 0`);
  migrate(`ALTER TABLE sets ADD COLUMN rep_count INTEGER DEFAULT 0`);
}

/* ------------------------ WRITE HELPERS ------------------------ */

export function insertSession(args: {
  sessionId: string;
  userId: string;
  deviceId?: string;
  label?: string;
  startedAt?: number;
}) {
  const db = getDb();
  db.runSync(
    `INSERT INTO sessions (id, user_id, device_id, label, started_at) VALUES (?, ?, ?, ?, ?)`,
    [args.sessionId, args.userId, args.deviceId ?? null, args.label ?? null, args.startedAt ?? Date.now()]
  );
}

export function insertSet(args: {
  setId: string;
  sessionId: string;
  userId: string;
  label?: string;
  startedAt?: number;
}) {
  const db = getDb();
  db.runSync(
    `INSERT INTO sets (id, session_id, user_id, label, started_at) VALUES (?, ?, ?, ?, ?)`,
    [
      args.setId,
      args.sessionId,
      args.userId,
      args.label ?? null,
      args.startedAt ?? Date.now(),
    ]
  );
}

export function endSession(sessionId: string) {
  const db = getDb();
  db.runSync(`UPDATE sessions SET ended_at = ? WHERE id = ?`, [Date.now(), sessionId]);
}

export function endSet(setId: string) {
  const db = getDb();
  db.runSync(`UPDATE sets SET ended_at = ? WHERE id = ?`, [Date.now(), setId]);
}

export type BaselineOffsets = {
  emg_left_tricep: number;
  emg_left_pec: number;
  emg_right_tricep: number;
  emg_right_pec: number;
};

export function saveBaselineOffsets(setId: string, offsets: BaselineOffsets) {
  const db = getDb();
  db.runSync(
    `UPDATE sets SET baseline_emg_left_tricep = ?, baseline_emg_left_pec = ?,
                     baseline_emg_right_tricep = ?, baseline_emg_right_pec = ?
     WHERE id = ?`,
    [offsets.emg_left_tricep, offsets.emg_left_pec, offsets.emg_right_tricep, offsets.emg_right_pec, setId]
  );
}

export function getBaselineOffsets(setId: string): BaselineOffsets {
  const db = getDb();
  const row = db.getFirstSync<any>(
    `SELECT baseline_emg_left_tricep, baseline_emg_left_pec,
            baseline_emg_right_tricep, baseline_emg_right_pec
     FROM sets WHERE id = ?`,
    [setId]
  );
  return {
    emg_left_tricep: row?.baseline_emg_left_tricep ?? 0,
    emg_left_pec: row?.baseline_emg_left_pec ?? 0,
    emg_right_tricep: row?.baseline_emg_right_tricep ?? 0,
    emg_right_pec: row?.baseline_emg_right_pec ?? 0,
  };
}

/* ------------------------ REP HELPERS ------------------------ */

export type RepRow = {
  id: number;
  set_id: string;
  rep_number: number;
  start_ms: number;
  end_ms: number | null;
  peak_emg: number | null;
  mean_emg: number | null;
};

export function insertRep(args: {
  setId: string;
  repNumber: number;
  startMs: number;
  endMs: number;
  peakEmg?: number;
  meanEmg?: number;
}) {
  const db = getDb();
  db.runSync(
    `INSERT INTO reps (set_id, rep_number, start_ms, end_ms, peak_emg, mean_emg)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [args.setId, args.repNumber, args.startMs, args.endMs, args.peakEmg ?? null, args.meanEmg ?? null]
  );
}

export function listRepsForSet(setId: string): RepRow[] {
  const db = getDb();
  return db.getAllSync<RepRow>(
    `SELECT * FROM reps WHERE set_id = ? ORDER BY rep_number ASC`,
    [setId]
  );
}

export function updateSetRepCount(setId: string, repCount: number) {
  const db = getDb();
  db.runSync(`UPDATE sets SET rep_count = ? WHERE id = ?`, [repCount, setId]);
}

export function renameSession(sessionId: string, label: string) {
  const db = getDb();
  db.runSync(`UPDATE sessions SET label = ? WHERE id = ?`, [label, sessionId]);
}

export function deleteSession(sessionId: string) {
  const db = getDb();
  db.runSync(`DELETE FROM samples WHERE session_id = ?`, [sessionId]);
  db.runSync(`DELETE FROM sets WHERE session_id = ?`, [sessionId]);
  db.runSync(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
}

export function insertSample(args: {
  userId: string;
  sessionId: string;
  setId: string;
  parsed: ParsedSample;
  serviceUuid?: string;
  characteristicUuid?: string;
  receivedAt?: number;
}) {
  const db = getDb();
  const { userId, sessionId, setId, parsed } = args;

  db.runSync(
    `INSERT INTO samples (
      session_id, set_id, user_id, t_ms,
      emg_left_tricep, emg_left_pec, emg_right_tricep, emg_right_pec,
      l_accx, l_accy, l_accz, l_roll, l_pitch, l_yaw,
      r_accx, r_accy, r_accz, r_roll, r_pitch, r_yaw,
      received_at, service_uuid, characteristic_uuid
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      setId,
      userId,
      parsed.t_ms,

      parsed.emg_left_tricep,
      parsed.emg_left_pec,
      parsed.emg_right_tricep,
      parsed.emg_right_pec,

      parsed.l_accx, parsed.l_accy, parsed.l_accz,
      parsed.l_roll, parsed.l_pitch, parsed.l_yaw,

      parsed.r_accx, parsed.r_accy, parsed.r_accz,
      parsed.r_roll, parsed.r_pitch, parsed.r_yaw,

      args.receivedAt ?? Date.now(),
      args.serviceUuid ?? null,
      args.characteristicUuid ?? null,
    ]
  );
}

/* ------------------------ PACKET PARSING ------------------------ */

/**
 * Parse a 36-byte WorkoutDataPacket_t into a ParsedSample.
 *
 *   [0-3]   uint32  timestamp_ms
 *   [4-11]  int16×4 EMG (left_tricep, left_pec, right_tricep, right_pec)
 *   [12-23] int16×6 Left IMU (accx, accy, accz, roll, pitch, yaw)
 *   [24-35] int16×6 Right IMU (accx, accy, accz, roll, pitch, yaw)
 *
 * All multi-byte values are little-endian (matching ESP32 native byte order).
 */
export function parsePacket(bytes: Uint8Array): ParsedSample | null {
  if (bytes.length < PACKET_SIZE) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function readUint32(): number {
    const val = view.getUint32(offset, true);
    offset += 4;
    return val;
  }

  function readInt16(): number {
    const val = view.getInt16(offset, true);
    offset += 2;
    return val;
  }

  return {
    t_ms: readUint32(),

    // Firmware scales EMG by 1000 → convert back to float
    emg_left_tricep: readInt16() / 1000,
    emg_left_pec: readInt16() / 1000,
    emg_right_tricep: readInt16() / 1000,
    emg_right_pec: readInt16() / 1000,

    l_accx: readInt16(), l_accy: readInt16(), l_accz: readInt16(),
    // Firmware scales IMU angles (roll/pitch/yaw) by 100 → convert back to float
    l_roll: readInt16() / 100, l_pitch: readInt16() / 100, l_yaw: readInt16() / 100,

    r_accx: readInt16(), r_accy: readInt16(), r_accz: readInt16(),
    r_roll: readInt16() / 100, r_pitch: readInt16() / 100, r_yaw: readInt16() / 100,
  };
}

/* ------------------------ READ HELPERS ------------------------ */

export function listSessions(userId: string, label?: string): SessionRow[] {
  const db = getDb();
  if (label) {
    return db.getAllSync<SessionRow>(
      `SELECT * FROM sessions WHERE user_id = ? AND label = ? ORDER BY started_at DESC`,
      [userId, label]
    );
  }
  return db.getAllSync<SessionRow>(
    `SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC`,
    [userId]
  );
}

export function listAllSessions(): SessionRow[] {
  const db = getDb();
  return db.getAllSync<SessionRow>(
    `SELECT * FROM sessions ORDER BY started_at DESC`
  );
}

export function listSets(sessionId: string): SetRow[] {
  const db = getDb();
  return db.getAllSync<SetRow>(
    `SELECT * FROM sets WHERE session_id = ? ORDER BY started_at ASC`,
    [sessionId]
  );
}

export function listSamplesForSet(setId: string, limit = 50, offset = 0): SampleRow[] {
  const db = getDb();
  return db.getAllSync<SampleRow>(
    `SELECT * FROM samples WHERE set_id = ? ORDER BY t_ms ASC LIMIT ? OFFSET ?`,
    [setId, limit, offset]
  );
}

/** Fetch every sample for a set – no LIMIT. Use for graph rendering. */
export function listAllSamplesForSet(setId: string): SampleRow[] {
  const db = getDb();
  return db.getAllSync<SampleRow>(
    `SELECT * FROM samples WHERE set_id = ? ORDER BY t_ms ASC`,
    [setId]
  );
}

export function listSamplesForSession(sessionId: string, limit = 200): SampleRow[] {
  const db = getDb();
  return db.getAllSync<SampleRow>(
    `SELECT * FROM samples WHERE session_id = ? ORDER BY t_ms ASC LIMIT ?`,
    [sessionId, limit]
  );
}

/** Fetch every sample for a session – no LIMIT. Use for graph rendering. */
export function listAllSamplesForSession(sessionId: string): SampleRow[] {
  const db = getDb();
  return db.getAllSync<SampleRow>(
    `SELECT * FROM samples WHERE session_id = ? ORDER BY t_ms ASC`,
    [sessionId]
  );
}

export function countSamplesForSet(setId: string): number {
  const db = getDb();
  const row = db.getFirstSync<{ c: number }>(
    `SELECT COUNT(*) as c FROM samples WHERE set_id = ?`,
    [setId]
  );
  return row?.c ?? 0;
}

/* ------------------------ CALIBRATION HELPERS ------------------------ */

/** Upsert calibration: one row per (user, exercise, channel). */
export function saveCalibration(
  userId: string,
  exerciseName: string,
  emgChannel: EmgChannel,
  mvcValue: number,
) {
  const db = getDb();
  const existing = db.getFirstSync<{ id: number }>(
    `SELECT id FROM calibrations WHERE user_id = ? AND exercise_name = ? AND emg_channel = ?`,
    [userId, exerciseName, emgChannel],
  );
  if (existing) {
    db.runSync(
      `UPDATE calibrations SET mvc_value = ?, calibrated_at = ? WHERE id = ?`,
      [mvcValue, Date.now(), existing.id],
    );
  } else {
    db.runSync(
      `INSERT INTO calibrations (user_id, exercise_name, emg_channel, mvc_value, calibrated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, exerciseName, emgChannel, mvcValue, Date.now()],
    );
  }
}

/** Get calibration for a specific channel. */
export function getCalibration(
  userId: string,
  exerciseName: string,
  emgChannel: EmgChannel,
): CalibrationRow | null {
  const db = getDb();
  return db.getFirstSync<CalibrationRow>(
    `SELECT * FROM calibrations WHERE user_id = ? AND exercise_name = ? AND emg_channel = ?`,
    [userId, exerciseName, emgChannel],
  );
}

/** Get the most recent calibration for any channel on this exercise. */
export function getLatestCalibration(
  userId: string,
  exerciseName: string,
): CalibrationRow | null {
  const db = getDb();
  return db.getFirstSync<CalibrationRow>(
    `SELECT * FROM calibrations
     WHERE user_id = ? AND exercise_name = ?
     ORDER BY calibrated_at DESC LIMIT 1`,
    [userId, exerciseName],
  );
}

export function listAllCalibrations(): CalibrationRow[] {
  const db = getDb();
  return db.getAllSync<CalibrationRow>(
    `SELECT * FROM calibrations ORDER BY calibrated_at DESC`
  );
}

/* ------------------------ TEST HELPERS (seed data) ------------------------ */

export function seedTestData(userId: string) {
  initBleDb();

  const sessionId = `sess_${Date.now()}`;
  const setId = `set_${Date.now()}`;

  insertSession({ sessionId, userId, deviceId: "TEST_DEVICE", label: "Test Exercise" });
  insertSet({ setId, sessionId, userId, label: "Test Set" });

  for (let i = 0; i < 20; i++) {
    insertSample({
      userId,
      sessionId,
      setId,
      parsed: {
        t_ms: i * 50,

        emg_left_tricep: 100 + i,
        emg_left_pec: 200 + i,
        emg_right_tricep: 300 + i,
        emg_right_pec: 400 + i,

        l_accx: 1 + i, l_accy: 2 + i, l_accz: 3 + i,
        l_roll: 4 + i, l_pitch: 5 + i, l_yaw: 6 + i,

        r_accx: 7 + i, r_accy: 8 + i, r_accz: 9 + i,
        r_roll: 10 + i, r_pitch: 11 + i, r_yaw: 12 + i,
      },
      serviceUuid: "service_test",
      characteristicUuid: "char_test",
      receivedAt: Date.now(),
    });
  }

  return { sessionId, setId };
}

/** Wipe all tables — use during development to reset schema */
export function clearBleDb() {
  const db = getDb();
  db.execSync(`
    DELETE FROM samples;
    DELETE FROM sets;
    DELETE FROM sessions;
  `);
}
