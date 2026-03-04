import React, { useEffect, useState } from "react";
import { View, Text, Button, ScrollView } from "react-native";
import { useAuth } from "../context/AuthContext";

import {
  initBleDb,
  seedTestData,
  listSessions,
  listSets,
  listSamplesForSet,
  clearBleDb,
  type SampleRow,
  type SessionRow,
  type SetRow,
} from "../hooks/bleDb";

type FlatRow = {
  sessionId: string;
  setId: string;
  sample: SampleRow;
};

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

  const onSeedAndLoadAll = () => {
    if (!user?.id) {
      setStatus("No user logged in.");
      return;
    }

    try {
      seedTestData(user.id);
      loadAllData();
    } catch (e: any) {
      setStatus(`Seed/load failed: ${e?.message ?? String(e)}`);
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
        DB Test
      </Text>

      <Button title="Seed test data + Load ALL" onPress={onSeedAndLoadAll} />
      <View style={{ height: 10 }} />
      <Button title="Load ALL data" onPress={loadAllData} />
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
          </View>
        ))}
      </View>
    </ScrollView>
  );
}