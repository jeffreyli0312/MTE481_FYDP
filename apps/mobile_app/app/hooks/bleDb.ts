// lib/bleDb.ts
import * as SQLite from "expo-sqlite";

/** Parsed BLE packet payload (what BLETest produces) */
export type ParsedSample = {
  t_ms: number;

  emg_left_tricep: number;
  emg_left_pec: number;
  emg_right_tricep: number;
  emg_right_pec: number;

  l_accx: number; l_accy: number; l_accz: number;
  l_gyrx: number; l_gyry: number; l_gyrz: number;

  r_accx: number; r_accy: number; r_accz: number;
  r_gyrx: number; r_gyry: number; r_gyrz: number;
};

export type SessionRow = {
  id: string;
  user_id: string;
  device_id: string | null;
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
  l_gyrx: number | null; l_gyry: number | null; l_gyrz: number | null;

  r_accx: number | null; r_accy: number | null; r_accz: number | null;
  r_gyrx: number | null; r_gyry: number | null; r_gyrz: number | null;

  received_at: number;
  service_uuid: string | null;
  characteristic_uuid: string | null;
};

let db: SQLite.SQLiteDatabase | null = null;

function getDb() {
  if (!db) db = SQLite.openDatabaseSync("ble.db");
  return db;
}

/** Create tables + indexes. Call once on app start. */
export function initBleDb() {
  const db = getDb();
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
    CREATE INDEX IF NOT EXISTS idx_samples_user_time ON samples(user_id, t_ms);
  `);
}

/** Called when user starts a session */
export function insertSession(args: {
  sessionId: string;
  userId: string;
  deviceId?: string;
  startedAt?: number;
}) {
  const db = getDb();
  db.runSync(
    `INSERT INTO sessions (id, user_id, device_id, started_at) VALUES (?, ?, ?, ?)`,
    [args.sessionId, args.userId, args.deviceId ?? null, args.startedAt ?? Date.now()]
  );
}

/** Called when user starts a set */
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

/** BLETest calls this for every parsed packet */
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
      l_accx, l_accy, l_accz, l_gyrx, l_gyry, l_gyrz,
      r_accx, r_accy, r_accz, r_gyrx, r_gyry, r_gyrz,
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
      parsed.l_gyrx, parsed.l_gyry, parsed.l_gyrz,

      parsed.r_accx, parsed.r_accy, parsed.r_accz,
      parsed.r_gyrx, parsed.r_gyry, parsed.r_gyrz,

      args.receivedAt ?? Date.now(),
      args.serviceUuid ?? null,
      args.characteristicUuid ?? null,
    ]
  );
}

/* ------------------------ READ HELPERS (for Analytics/tests) ------------------------ */

export function listSessions(userId: string): SessionRow[] {
  const db = getDb();
  return db.getAllSync<SessionRow>(
    `SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC`,
    [userId]
  );
}

export function listSets(sessionId: string): SetRow[] {
  const db = getDb();
  return db.getAllSync<SetRow>(
    `SELECT * FROM sets WHERE session_id = ? ORDER BY started_at DESC`,
    [sessionId]
  );
}

export function listSamplesForSet(setId: string, limit = 50): SampleRow[] {
  const db = getDb();
  return db.getAllSync<SampleRow>(
    `SELECT * FROM samples WHERE set_id = ? ORDER BY t_ms ASC LIMIT ?`,
    [setId, limit]
  );
}

export function listSamplesForSession(sessionId: string, limit = 200): SampleRow[] {
  const db = getDb();
  return db.getAllSync<SampleRow>(
    `SELECT * FROM samples WHERE session_id = ? ORDER BY t_ms ASC LIMIT ?`,
    [sessionId, limit]
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

/* ------------------------ TEST HELPERS (seed data) ------------------------ */

export function seedTestData(userId: string) {
  initBleDb();

  const sessionId = `sess_${Date.now()}`;
  const setId = `set_${Date.now()}`;

  insertSession({ sessionId, userId, deviceId: "TEST_DEVICE" });
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
        l_gyrx: 4 + i, l_gyry: 5 + i, l_gyrz: 6 + i,

        r_accx: 7 + i, r_accy: 8 + i, r_accz: 9 + i,
        r_gyrx: 10 + i, r_gyry: 11 + i, r_gyrz: 12 + i,
      },
      serviceUuid: "service_test",
      characteristicUuid: "char_test",
      receivedAt: Date.now(),
    });
  }

  return { sessionId, setId };
}

/** Optional: wipe tables during debugging */
export function clearBleDb() {
  const db = getDb();
  db.execSync(`
    DELETE FROM samples;
    DELETE FROM sets;
    DELETE FROM sessions;
  `);
}