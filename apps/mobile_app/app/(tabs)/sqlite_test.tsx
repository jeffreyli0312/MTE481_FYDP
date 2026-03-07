import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import {
  Text,
  Card,
  Button,
  Chip,
  DataTable,
  Divider,
  IconButton,
  Banner,
} from "react-native-paper";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../theme";
import {
  initBleDb,
  listSessions,
  listSets,
  listSamplesForSet,
  countSamplesForSet,
  clearBleDb,
  type SessionRow,
  type SetRow,
  type SampleRow,
} from "../sqlite/bleDb";

type ViewMode = "sessions" | "sets" | "samples";

export default function DatabaseViewer() {
  const { user } = useAuth();
  const { colors } = useAppTheme();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [sampleTotal, setSampleTotal] = useState(0);

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("sessions");
  const [status, setStatus] = useState("");
  const [showClearBanner, setShowClearBanner] = useState(false);

  const [samplePage, setSamplePage] = useState(0);
  const SAMPLES_PER_PAGE = 20;

  const loadSessions = useCallback(() => {
    if (!user?.id) return;
    try {
      const rows = listSessions(user.id);
      setSessions(rows);
      setStatus(`${rows.length} session${rows.length !== 1 ? "s" : ""}`);
    } catch (e: any) {
      setStatus(`Load failed: ${e?.message ?? String(e)}`);
    }
  }, [user?.id]);

  useEffect(() => {
    initBleDb();
    loadSessions();
  }, [loadSessions]);

  function openSession(session: SessionRow) {
    const rows = listSets(session.id);
    setSets(rows);
    setSelectedSession(session);
    setViewMode("sets");
    setStatus(`${rows.length} set${rows.length !== 1 ? "s" : ""} in session`);
  }

  function openSet(set: SetRow) {
    const total = countSamplesForSet(set.id);
    const rows = listSamplesForSet(set.id, SAMPLES_PER_PAGE);
    setSamples(rows);
    setSampleTotal(total);
    setSamplePage(0);
    setSelectedSet(set);
    setViewMode("samples");
    setStatus(`${total} sample${total !== 1 ? "s" : ""} in set`);
  }

  function loadSamplePage(page: number) {
    if (!selectedSet) return;
    const offset = page * SAMPLES_PER_PAGE;
    const rows = listSamplesForSet(selectedSet.id, 5000);
    setSamples(rows.slice(offset, offset + SAMPLES_PER_PAGE));
    setSamplePage(page);
  }

  function goBack() {
    if (viewMode === "samples") {
      setViewMode("sets");
      setSelectedSet(null);
      setSamples([]);
    } else if (viewMode === "sets") {
      setViewMode("sessions");
      setSelectedSession(null);
      setSets([]);
      loadSessions();
    }
  }

  function handleClear() {
    clearBleDb();
    setSessions([]);
    setSets([]);
    setSamples([]);
    setSelectedSession(null);
    setSelectedSet(null);
    setViewMode("sessions");
    setShowClearBanner(false);
    setStatus("Database cleared");
  }

  function fmtTime(ms: number | null | undefined) {
    if (ms == null) return "—";
    return new Date(ms).toLocaleString();
  }

  function shortId(id: string) {
    return id.length > 20 ? id.slice(0, 8) + "..." + id.slice(-6) : id;
  }

  const totalPages = Math.max(1, Math.ceil(sampleTotal / SAMPLES_PER_PAGE));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        {viewMode !== "sessions" && (
          <IconButton icon="arrow-left" onPress={goBack} size={22} />
        )}
        <View style={{ flex: 1 }}>
          <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "900" }}>
            {viewMode === "sessions" && "Database Viewer"}
            {viewMode === "sets" && "Sets"}
            {viewMode === "samples" && "Samples"}
          </Text>
          {selectedSession && (
            <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
              Session: {shortId(selectedSession.id)}
              {selectedSet ? ` / Set: ${shortId(selectedSet.id)}` : ""}
            </Text>
          )}
        </View>
        <Chip compact textStyle={{ fontSize: 11 }}>{status}</Chip>
      </View>

      <Banner
        visible={showClearBanner}
        actions={[
          { label: "Cancel", onPress: () => setShowClearBanner(false) },
          { label: "Clear All", onPress: handleClear },
        ]}
        icon="alert"
      >
        This will permanently delete all sessions, sets, and samples.
      </Banner>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <Button
          mode="outlined"
          icon="refresh"
          compact
          onPress={() => {
            if (viewMode === "sessions") loadSessions();
            else if (viewMode === "sets" && selectedSession) openSession(selectedSession);
            else if (viewMode === "samples" && selectedSet) openSet(selectedSet);
          }}
        >
          Refresh
        </Button>
        <Button
          mode="outlined"
          icon="delete-outline"
          compact
          textColor={colors.error}
          onPress={() => setShowClearBanner(true)}
        >
          Clear DB
        </Button>
      </View>

      <Divider style={{ marginBottom: 12 }} />

      {/* ──────── SESSIONS VIEW ──────── */}
      {viewMode === "sessions" && (
        <>
          {sessions.length === 0 ? (
            <Card mode="outlined" style={styles.emptyCard}>
              <Card.Content>
                <Text variant="bodyMedium" style={{ textAlign: "center", color: colors.onSurfaceVariant }}>
                  No sessions found
                </Text>
              </Card.Content>
            </Card>
          ) : (
            sessions.map((s) => (
              <Card
                key={s.id}
                mode="outlined"
                style={styles.rowCard}
                onPress={() => openSession(s)}
              >
                <Card.Content>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                        {shortId(s.id)}
                      </Text>
                      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                        Started: {fmtTime(s.started_at)}
                      </Text>
                      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                        Ended: {fmtTime(s.ended_at)}
                      </Text>
                      {s.device_id && (
                        <Chip compact style={styles.deviceChip} textStyle={{ fontSize: 10 }}>
                          {s.device_id}
                        </Chip>
                      )}
                    </View>
                    <IconButton icon="chevron-right" size={20} />
                  </View>
                </Card.Content>
              </Card>
            ))
          )}
        </>
      )}

      {/* ──────── SETS VIEW ──────── */}
      {viewMode === "sets" && (
        <>
          {sets.length === 0 ? (
            <Card mode="outlined" style={styles.emptyCard}>
              <Card.Content>
                <Text variant="bodyMedium" style={{ textAlign: "center", color: colors.onSurfaceVariant }}>
                  No sets in this session
                </Text>
              </Card.Content>
            </Card>
          ) : (
            sets.map((st, idx) => {
              const count = countSamplesForSet(st.id);
              return (
                <Card
                  key={st.id}
                  mode="outlined"
                  style={styles.rowCard}
                  onPress={() => openSet(st)}
                >
                  <Card.Content>
                    <View style={styles.cardRow}>
                      <View style={[styles.setCircle, { backgroundColor: colors.primaryContainer }]}>
                        <Text style={{ fontWeight: "900", color: colors.primary }}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                          {st.label ?? shortId(st.id)}
                        </Text>
                        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                          Started: {fmtTime(st.started_at)}
                        </Text>
                        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                          Ended: {fmtTime(st.ended_at)}
                        </Text>
                      </View>
                      <Chip compact textStyle={{ fontSize: 11 }}>{count} samples</Chip>
                      <IconButton icon="chevron-right" size={20} />
                    </View>
                  </Card.Content>
                </Card>
              );
            })
          )}
        </>
      )}

      {/* ──────── SAMPLES VIEW ──────── */}
      {viewMode === "samples" && (
        <>
          {samples.length === 0 ? (
            <Card mode="outlined" style={styles.emptyCard}>
              <Card.Content>
                <Text variant="bodyMedium" style={{ textAlign: "center", color: colors.onSurfaceVariant }}>
                  No samples in this set
                </Text>
              </Card.Content>
            </Card>
          ) : (
            <>
              {/* EMG Table */}
              <Text variant="titleSmall" style={{ color: colors.onSurface, marginBottom: 4, fontWeight: "900" }}>
                EMG Data
              </Text>
              <ScrollView horizontal>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title style={styles.colNarrow}>t_ms</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>L Tri</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>L Pec</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>R Tri</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>R Pec</DataTable.Title>
                  </DataTable.Header>
                  {samples.map((s) => (
                    <DataTable.Row key={s.id}>
                      <DataTable.Cell style={styles.colNarrow}>{s.t_ms}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.emg_left_tricep}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.emg_left_pec}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.emg_right_tricep}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.emg_right_pec}</DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable>
              </ScrollView>

              <Divider style={{ marginVertical: 12 }} />

              {/* Left IMU Table */}
              <Text variant="titleSmall" style={{ color: colors.onSurface, marginBottom: 4, fontWeight: "900" }}>
                Left IMU
              </Text>
              <ScrollView horizontal>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title style={styles.colNarrow}>t_ms</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>AccX</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>AccY</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>AccZ</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Roll</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Pitch</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Yaw</DataTable.Title>
                  </DataTable.Header>
                  {samples.map((s) => (
                    <DataTable.Row key={s.id}>
                      <DataTable.Cell style={styles.colNarrow}>{s.t_ms}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.l_accx}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.l_accy}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.l_accz}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.l_roll}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.l_pitch}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.l_yaw}</DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable>
              </ScrollView>

              <Divider style={{ marginVertical: 12 }} />

              {/* Right IMU Table */}
              <Text variant="titleSmall" style={{ color: colors.onSurface, marginBottom: 4, fontWeight: "900" }}>
                Right IMU
              </Text>
              <ScrollView horizontal>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title style={styles.colNarrow}>t_ms</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>AccX</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>AccY</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>AccZ</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Roll</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Pitch</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Yaw</DataTable.Title>
                  </DataTable.Header>
                  {samples.map((s) => (
                    <DataTable.Row key={s.id}>
                      <DataTable.Cell style={styles.colNarrow}>{s.t_ms}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.r_accx}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.r_accy}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.r_accz}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.r_roll}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.r_pitch}</DataTable.Cell>
                      <DataTable.Cell style={styles.col} numeric>{s.r_yaw}</DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable>
              </ScrollView>

              {/* Pagination */}
              {totalPages > 1 && (
                <View style={styles.paginationRow}>
                  <Button
                    mode="text"
                    compact
                    disabled={samplePage === 0}
                    onPress={() => loadSamplePage(samplePage - 1)}
                    icon="chevron-left"
                  >
                    Prev
                  </Button>
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                    Page {samplePage + 1} / {totalPages}
                  </Text>
                  <Button
                    mode="text"
                    compact
                    disabled={samplePage >= totalPages - 1}
                    onPress={() => loadSamplePage(samplePage + 1)}
                    icon="chevron-right"
                    contentStyle={{ flexDirection: "row-reverse" }}
                  >
                    Next
                  </Button>
                </View>
              )}
            </>
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 4,
  },
  toolbar: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 12,
    marginTop: 8,
  },
  rowCard: {
    borderRadius: 12,
    marginBottom: 10,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  setCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceChip: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  colNarrow: {
    width: 80,
  },
  col: {
    width: 70,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
});
