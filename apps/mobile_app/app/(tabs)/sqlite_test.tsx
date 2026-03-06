import React, { useEffect, useState } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import { useAuth } from "../context/AuthContext";

import {
  initBleDb,
  insertSession,
  insertSet,
  insertSample,
  listSessions,
  listSets,
  listSamplesForSet,
  clearBleDb,
  type ParsedSample,
  type SampleRow,
  type SessionRow,
  type SetRow,
} from "../hooks/bleDb";

type FlatRow = {
  sessionId: string;
  setId: string;
  sample: SampleRow;
};

const bytes = new Uint8Array([
  // timestamp = 1000 ms (uint32 little-endian)
  232, 3, 0, 0,

  // EMG values
  // left_tricep = 120
  120, 0,
  // left_pec = 240
  240, 0,
  // right_tricep = 360
  104, 1,
  // right_pec = 480
  224, 1,

  // left acc
  // l_accx = 10
  10, 0,
  // l_accy = 20
  20, 0,
  // l_accz = 30
  30, 0,

  // left gyr
  // l_gyrx = 40
  40, 0,
  // l_gyry = 50
  50, 0,
  // l_gyrz = 60
  60, 0,

  // right acc
  // r_accx = 70
  70, 0,
  // r_accy = 80
  80, 0,
  // r_accz = 90
  90, 0,

  // right gyr
  // r_gyrx = 100
  100, 0,
  // r_gyry = 110
  110, 0,
  // r_gyrz = 120
  120, 0,
]);

function parseBleBytes(bytes: Uint8Array): ParsedSample {
  if (bytes.length < 36) {
    throw new Error(`Expected 36 bytes, got ${bytes.length}`);
  }

  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength
  );

  return {
    t_ms: view.getUint32(0, true),

    emg_left_tricep: view.getInt16(4, true),
    emg_left_pec: view.getInt16(6, true),
    emg_right_tricep: view.getInt16(8, true),
    emg_right_pec: view.getInt16(10, true),

    l_accx: view.getInt16(12, true),
    l_accy: view.getInt16(14, true),
    l_accz: view.getInt16(16, true),

    l_gyrx: view.getInt16(18, true),
    l_gyry: view.getInt16(20, true),
    l_gyrz: view.getInt16(22, true),

    r_accx: view.getInt16(24, true),
    r_accy: view.getInt16(26, true),
    r_accz: view.getInt16(28, true),

    r_gyrx: view.getInt16(30, true),
    r_gyry: view.getInt16(32, true),
    r_gyrz: view.getInt16(34, true),
  };
}

export default function ShowDbTest() {
  const { user } = useAuth(); // expects user.id

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [setsBySession, setSetsBySession] = useState<Record<string, SetRow[]>>(
    {}
  );
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      initBleDb();
      setStatus("DB initialized ✅");
    } catch (e: any) {
      setStatus(`DB init failed: ${e?.message ?? String(e)}`);
    }
  }, []);

  const loadAllData = () => {
    if (!user?.id) {
      setStatus("No user logged in.");
      return;
    }

    try {
      const allSessions = listSessions(user.id);

      const nextSetsBySession: Record<string, SetRow[]> = {};
      const flat: FlatRow[] = [];

      for (const sess of allSessions) {
        const sets = listSets(sess.id);
        nextSetsBySession[sess.id] = sets;

        for (const st of sets) {
          // NOTE: If you have lots of samples, increase limit or add pagination.
          const samples = listSamplesForSet(st.id, 1000);
          for (const smp of samples) {
            flat.push({ sessionId: sess.id, setId: st.id, sample: smp });
          }
        }
      }

      setSessions(allSessions);
      setSetsBySession(nextSetsBySession);

      // Sort all samples by received_at then t_ms (optional)
      flat.sort((a, b) => {
        const ra = a.sample.received_at ?? 0;
        const rb = b.sample.received_at ?? 0;
        if (ra !== rb) return ra - rb;
        return a.sample.t_ms - b.sample.t_ms;
      });

      setRows(flat);

      const totalSets = Object.values(nextSetsBySession).reduce(
        (acc, arr) => acc + arr.length,
        0
      );

      setStatus(
        `Loaded ✅ sessions=${allSessions.length}, sets=${totalSets}, samples=${flat.length}`
      );
    } catch (e: any) {
      setStatus(`Load failed: ${e?.message ?? String(e)}`);
    }
  };

  const onInsertFakeBleData = () => {
    if (!user?.id) {
      setStatus("No user logged in.");
      return;
    }

    try {
      const parsed = parseBleBytes(bytes);

      const now = Date.now();
      const sessionId = `sess_${now}`;
      const setId = `set_${now}`;

      insertSession({
        sessionId,
        userId: user.id,
        deviceId: "FAKE_BLE_DEVICE",
        startedAt: now,
      });

      insertSet({
        setId,
        sessionId,
        userId: user.id,
        label: "Fake BLE Set",
        startedAt: now,
      });

      insertSample({
        userId: user.id,
        sessionId,
        setId,
        parsed,
        serviceUuid: "service_fake",
        characteristicUuid: "char_fake",
        receivedAt: now,
      });

      loadAllData();
      setStatus("Inserted fake BLE bytes into SQLite ✅");
    } catch (e: any) {
      setStatus(`Insert failed: ${e?.message ?? String(e)}`);
    }
  };

  const onClearAll = () => {
    try {
      clearBleDb(); // deletes samples, sets, sessions
      setSessions([]);
      setSetsBySession({});
      setRows([]);
      setStatus("Cleared ✅ (samples/sets/sessions deleted)");
    } catch (e: any) {
      setStatus(`Clear failed: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
        DB Testing
      </Text>

      <Button title="Insert fake BLE bytes + Load ALL" onPress={onInsertFakeBleData} />
      <View style={{ height: 10 }} />
      <View style={{ height: 10 }} />
      <Button title="Clear ALL data" onPress={onClearAll} />

      <Text style={{ marginTop: 12 }}>{status}</Text>

      {/* Optional: summary */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: "600" }}>Sessions</Text>
        {sessions.map((s) => (
          <Text key={s.id} style={{ marginTop: 4 }}>
            {s.id} (device: {s.device_id ?? "null"})
          </Text>
        ))}
      </View>

      {/* All samples */}
      {/* All samples */}
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: "600" }}>All Samples</Text>

        {rows.map(({ sessionId, setId, sample }) => (
          <View key={sample.id} style={{ marginTop: 10, paddingBottom: 10 }}>
            <Text style={{ fontSize: 12, opacity: 0.8 }}>
              session: {sessionId}
            </Text>
            <Text style={{ fontSize: 12, opacity: 0.8 }}>set: {setId}</Text>

            <Text>t_ms: {sample.t_ms}</Text>

            <Text>
              EMG LT: {sample.emg_left_tricep} | LP: {sample.emg_left_pec}
            </Text>
            <Text>
              EMG RT: {sample.emg_right_tricep} | RP: {sample.emg_right_pec}
            </Text>

            <Text>
              L ACC: x={sample.l_accx} y={sample.l_accy} z={sample.l_accz}
            </Text>
            <Text>
              L GYR: x={sample.l_gyrx} y={sample.l_gyry} z={sample.l_gyrz}
            </Text>

            <Text>
              R ACC: x={sample.r_accx} y={sample.r_accy} z={sample.r_accz}
            </Text>
            <Text>
              R GYR: x={sample.r_gyrx} y={sample.r_gyry} z={sample.r_gyrz}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}