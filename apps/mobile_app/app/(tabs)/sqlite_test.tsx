import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, View, StyleSheet, Alert, TextInput as RNTextInput } from "react-native";
import {
  Text,
  Card,
  Button,
  Chip,
  DataTable,
  Divider,
  IconButton,
  Banner,
  SegmentedButtons,
  Portal,
  Modal,
  TextInput,
} from "react-native-paper";
import { useAppTheme } from "../theme";
import {
  initBleDb,
  listAllSessions,
  listSets,
  listSamplesForSet,
  countSamplesForSet,
  clearBleDb,
  renameSession,
  deleteSession,
  type SessionRow,
  type SetRow,
  type SampleRow,
} from "../sqlite/bleDb";

type ViewMode = "sessions" | "sets" | "samples";
type SampleTab = "emg" | "imu_left" | "imu_right";

export default function DatabaseViewer() {
  const { colors } = useAppTheme();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [sampleTotal, setSampleTotal] = useState(0);

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("sessions");
  const [sampleTab, setSampleTab] = useState<SampleTab>("emg");
  const [status, setStatus] = useState("");
  const [showClearBanner, setShowClearBanner] = useState(false);

  // Rename modal state
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState<SessionRow | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadSessions = useCallback(() => {
    try {
      const rows = listAllSessions();
      setSessions(rows);
      setStatus(`${rows.length} session${rows.length !== 1 ? "s" : ""}`);
    } catch (e: any) {
      setStatus(`Load failed: ${e?.message ?? String(e)}`);
    }
  }, []);

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
    const rows = listSamplesForSet(set.id, total || 50);
    setSamples(rows);
    setSampleTotal(total);
    setSampleTab("emg");
    setSelectedSet(set);
    setViewMode("samples");
    setStatus(`${total} sample${total !== 1 ? "s" : ""} in set`);
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

  function handleRenameOpen(session: SessionRow) {
    setRenameTarget(session);
    setRenameValue(session.label ?? "");
    setRenameVisible(true);
  }

  function handleRenameSave() {
    if (!renameTarget) return;
    renameSession(renameTarget.id, renameValue.trim());
    setRenameVisible(false);
    setRenameTarget(null);
    loadSessions();
  }

  function handleDelete(session: SessionRow) {
    const name = session.label || shortId(session.id);
    Alert.alert(
      "Delete Session",
      `Delete "${name}" and all its sets and samples?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteSession(session.id);
            loadSessions();
          },
        },
      ],
    );
  }

  function fmtTime(ms: number | null | undefined) {
    if (ms == null) return "\u2014";
    return new Date(ms).toLocaleString();
  }

  function shortId(id: string) {
    return id.length > 20 ? id.slice(0, 8) + "..." + id.slice(-6) : id;
  }

  return (
    <>
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
                Session: {selectedSession.label || shortId(selectedSession.id)}
                {selectedSet ? ` / Set: ${selectedSet.label || shortId(selectedSet.id)}` : ""}
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
                        <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: "700" }}>
                          {s.label || shortId(s.id)}
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
                      <IconButton
                        icon="pencil-outline"
                        size={18}
                        onPress={() => handleRenameOpen(s)}
                      />
                      <IconButton
                        icon="trash-can-outline"
                        size={18}
                        iconColor={colors.error}
                        onPress={() => handleDelete(s)}
                      />
                      <IconButton icon="chevron-right" size={20} onPress={() => openSession(s)} />
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
                <SegmentedButtons
                  value={sampleTab}
                  onValueChange={(v) => setSampleTab(v as SampleTab)}
                  buttons={[
                    { value: "emg", label: "EMG" },
                    { value: "imu_left", label: "Left IMU" },
                    { value: "imu_right", label: "Right IMU" },
                  ]}
                  style={{ marginBottom: 12 }}
                />

                <ScrollView horizontal>
                  <DataTable>
                    <DataTable.Header>
                      <DataTable.Title style={styles.colNarrow}>t_ms</DataTable.Title>
                      {sampleTab === "emg" && (
                        <>
                          <DataTable.Title style={styles.col} numeric>L Tri</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>L Pec</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>R Tri</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>R Pec</DataTable.Title>
                        </>
                      )}
                      {sampleTab === "imu_left" && (
                        <>
                          <DataTable.Title style={styles.col} numeric>AccX</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>AccY</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>AccZ</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>Roll</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>Pitch</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>Yaw</DataTable.Title>
                        </>
                      )}
                      {sampleTab === "imu_right" && (
                        <>
                          <DataTable.Title style={styles.col} numeric>AccX</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>AccY</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>AccZ</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>Roll</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>Pitch</DataTable.Title>
                          <DataTable.Title style={styles.col} numeric>Yaw</DataTable.Title>
                        </>
                      )}
                    </DataTable.Header>

                    {samples.map((s) => (
                      <DataTable.Row key={s.id}>
                        <DataTable.Cell style={styles.colNarrow}>{s.t_ms}</DataTable.Cell>
                        {sampleTab === "emg" && (
                          <>
                            <DataTable.Cell style={styles.col} numeric>{s.emg_left_tricep}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.emg_left_pec}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.emg_right_tricep}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.emg_right_pec}</DataTable.Cell>
                          </>
                        )}
                        {sampleTab === "imu_left" && (
                          <>
                            <DataTable.Cell style={styles.col} numeric>{s.l_accx}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.l_accy}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.l_accz}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.l_roll}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.l_pitch}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.l_yaw}</DataTable.Cell>
                          </>
                        )}
                        {sampleTab === "imu_right" && (
                          <>
                            <DataTable.Cell style={styles.col} numeric>{s.r_accx}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.r_accy}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.r_accz}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.r_roll}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.r_pitch}</DataTable.Cell>
                            <DataTable.Cell style={styles.col} numeric>{s.r_yaw}</DataTable.Cell>
                          </>
                        )}
                      </DataTable.Row>
                    ))}
                  </DataTable>
                </ScrollView>
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Rename Modal */}
      <Portal>
        <Modal
          visible={renameVisible}
          onDismiss={() => setRenameVisible(false)}
          contentContainerStyle={[styles.modal, { backgroundColor: colors.surface }]}
        >
          <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 12 }}>
            Rename Session
          </Text>
          <TextInput
            label="Session name"
            value={renameValue}
            onChangeText={setRenameValue}
            mode="outlined"
            autoFocus
          />
          <View style={styles.modalActions}>
            <Button onPress={() => setRenameVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleRenameSave}>
              Save
            </Button>
          </View>
        </Modal>
      </Portal>
    </>
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
  modal: {
    margin: 24,
    padding: 20,
    borderRadius: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
});
