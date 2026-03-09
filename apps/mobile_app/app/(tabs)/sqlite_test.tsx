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
  listRepsForSet,
  listAllCalibrations,
  clearBleDb,
  renameSession,
  deleteSession,
  type SessionRow,
  type SetRow,
  type SampleRow,
  type RepRow,
  type CalibrationRow,
} from "../sqlite/bleDb";

type ViewMode = "sessions" | "sets" | "samples" | "reps" | "calibrations";
type SampleTab = "emg" | "imu_left" | "imu_right";

export default function DatabaseViewer() {
  const { colors } = useAppTheme();

  const PAGE_SIZE = 50;

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [sampleTotal, setSampleTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationRow[]>([]);

  const [selectedSession, setSelectedSession] = useState<SessionRow | null>(null);
  const [selectedSet, setSelectedSet] = useState<SetRow | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("sessions");
  const [sampleTab, setSampleTab] = useState<SampleTab>("emg");
  const [status, setStatus] = useState("");
  const [showClearBanner, setShowClearBanner] = useState(false);

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

  function loadPage(setId: string, pageNum: number) {
    const rows = listSamplesForSet(setId, PAGE_SIZE, pageNum * PAGE_SIZE);
    setSamples(rows);
    setPage(pageNum);
  }

  function openSet(set: SetRow) {
    const total = countSamplesForSet(set.id);
    setSampleTotal(total);
    setSampleTab("emg");
    setSelectedSet(set);
    setViewMode("samples");
    setStatus(`${total} sample${total !== 1 ? "s" : ""} in set`);
    loadPage(set.id, 0);
  }

  function openReps(set: SetRow) {
    const rows = listRepsForSet(set.id);
    setSelectedSet(set);
    setReps(rows);
    setViewMode("reps");
    setStatus(`${rows.length} rep${rows.length !== 1 ? "s" : ""} in set`);
  }

  function openCalibrations() {
    const rows = listAllCalibrations();
    setCalibrations(rows);
    setViewMode("calibrations");
    setStatus(`${rows.length} calibration${rows.length !== 1 ? "s" : ""}`);
  }

  function goBack() {
    if (viewMode === "samples" || viewMode === "reps") {
      setViewMode("sets");
      setSelectedSet(null);
      setSamples([]);
      setReps([]);
    } else if (viewMode === "sets") {
      setViewMode("sessions");
      setSelectedSession(null);
      setSets([]);
      loadSessions();
    } else if (viewMode === "calibrations") {
      setViewMode("sessions");
      setCalibrations([]);
      loadSessions();
    }
  }

  function handleClear() {
    clearBleDb();
    setSessions([]);
    setSets([]);
    setSamples([]);
    setReps([]);
    setCalibrations([]);
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

  function fmtNum(v: number | null | undefined, digits = 4) {
    if (v == null) return "\u2014";
    return Number(v).toFixed(digits);
  }

  const viewTitle =
    viewMode === "sessions" ? "Database Viewer" :
    viewMode === "sets" ? "Sets" :
    viewMode === "samples" ? "Samples" :
    viewMode === "reps" ? "Reps" :
    "Calibrations";

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
              {viewTitle}
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
          This will permanently delete all sessions, sets, samples, reps, and calibrations.
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
              else if (viewMode === "reps" && selectedSet) openReps(selectedSet);
              else if (viewMode === "calibrations") openCalibrations();
            }}
          >
            Refresh
          </Button>
          {viewMode === "sessions" && (
            <Button
              mode="outlined"
              icon="tune"
              compact
              onPress={openCalibrations}
            >
              Calibrations
            </Button>
          )}
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
                const repCount = st.rep_count ?? 0;
                const hasBaseline = (st.baseline_emg_left_pec ?? 0) !== 0 || (st.baseline_emg_left_tricep ?? 0) !== 0;
                return (
                  <Card
                    key={st.id}
                    mode="outlined"
                    style={styles.rowCard}
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
                          <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            <Chip compact textStyle={{ fontSize: 10 }}>{count} samples</Chip>
                            <Chip compact textStyle={{ fontSize: 10 }}>{repCount} reps</Chip>
                            {hasBaseline && (
                              <Chip compact textStyle={{ fontSize: 10 }} icon="check-circle-outline">Baseline</Chip>
                            )}
                          </View>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                        <Button
                          mode="outlined"
                          compact
                          icon="table"
                          onPress={() => openSet(st)}
                          style={{ flex: 1 }}
                          labelStyle={{ fontSize: 12 }}
                        >
                          Samples
                        </Button>
                        <Button
                          mode="outlined"
                          compact
                          icon="repeat"
                          onPress={() => openReps(st)}
                          style={{ flex: 1 }}
                          labelStyle={{ fontSize: 12 }}
                        >
                          Reps ({repCount})
                        </Button>
                      </View>
                      {hasBaseline && (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.outline }}>
                          <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
                            Baseline Offsets
                          </Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                            <Text variant="labelSmall" style={{ color: colors.onSurface }}>
                              L Tri: {fmtNum(st.baseline_emg_left_tricep)}
                            </Text>
                            <Text variant="labelSmall" style={{ color: colors.onSurface }}>
                              L Pec: {fmtNum(st.baseline_emg_left_pec)}
                            </Text>
                            <Text variant="labelSmall" style={{ color: colors.onSurface }}>
                              R Tri: {fmtNum(st.baseline_emg_right_tricep)}
                            </Text>
                            <Text variant="labelSmall" style={{ color: colors.onSurface }}>
                              R Pec: {fmtNum(st.baseline_emg_right_pec)}
                            </Text>
                          </View>
                        </View>
                      )}
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

                    <DataTable.Pagination
                      page={page}
                      numberOfPages={Math.ceil(sampleTotal / PAGE_SIZE)}
                      onPageChange={(p) => {
                        if (selectedSet) loadPage(selectedSet.id, p);
                      }}
                      label={`${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, sampleTotal)} of ${sampleTotal}`}
                      showFastPaginationControls
                    />
                  </DataTable>
                </ScrollView>
              </>
            )}
          </>
        )}

        {/* ──────── REPS VIEW ──────── */}
        {viewMode === "reps" && (
          <>
            {reps.length === 0 ? (
              <Card mode="outlined" style={styles.emptyCard}>
                <Card.Content>
                  <Text variant="bodyMedium" style={{ textAlign: "center", color: colors.onSurfaceVariant }}>
                    No reps recorded for this set
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              <ScrollView horizontal>
                <DataTable>
                  <DataTable.Header>
                    <DataTable.Title style={styles.colNarrow}>Rep #</DataTable.Title>
                    <DataTable.Title style={styles.colWide} numeric>Start (ms)</DataTable.Title>
                    <DataTable.Title style={styles.colWide} numeric>End (ms)</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Duration</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Peak EMG</DataTable.Title>
                    <DataTable.Title style={styles.col} numeric>Mean EMG</DataTable.Title>
                  </DataTable.Header>

                  {reps.map((r) => {
                    const dur = r.end_ms != null ? r.end_ms - r.start_ms : null;
                    return (
                      <DataTable.Row key={r.id}>
                        <DataTable.Cell style={styles.colNarrow}>{r.rep_number}</DataTable.Cell>
                        <DataTable.Cell style={styles.colWide} numeric>{r.start_ms}</DataTable.Cell>
                        <DataTable.Cell style={styles.colWide} numeric>{r.end_ms ?? "\u2014"}</DataTable.Cell>
                        <DataTable.Cell style={styles.col} numeric>
                          {dur != null ? `${(dur / 1000).toFixed(2)}s` : "\u2014"}
                        </DataTable.Cell>
                        <DataTable.Cell style={styles.col} numeric>{fmtNum(r.peak_emg)}</DataTable.Cell>
                        <DataTable.Cell style={styles.col} numeric>{fmtNum(r.mean_emg)}</DataTable.Cell>
                      </DataTable.Row>
                    );
                  })}
                </DataTable>
              </ScrollView>
            )}
          </>
        )}

        {/* ──────── CALIBRATIONS VIEW ──────── */}
        {viewMode === "calibrations" && (
          <>
            {calibrations.length === 0 ? (
              <Card mode="outlined" style={styles.emptyCard}>
                <Card.Content>
                  <Text variant="bodyMedium" style={{ textAlign: "center", color: colors.onSurfaceVariant }}>
                    No calibrations found
                  </Text>
                </Card.Content>
              </Card>
            ) : (
              calibrations.map((c) => (
                <Card key={c.id} mode="outlined" style={styles.rowCard}>
                  <Card.Content>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: "700" }}>
                          {c.exercise_name}
                        </Text>
                        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                          Channel: {c.emg_channel}
                        </Text>
                        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                          Date: {fmtTime(c.calibrated_at)}
                        </Text>
                        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                          User: {shortId(c.user_id)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>MVC</Text>
                        <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                          {c.mvc_value.toFixed(4)}
                        </Text>
                      </View>
                    </View>
                  </Card.Content>
                </Card>
              ))
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
  colWide: {
    width: 100,
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
