import React, { useEffect, useMemo, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Pressable,
    StatusBar,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../context/ThemeContext";

type SetRow = {
    id: string;
    session_id: string;
    created_at: string;
    label?: string | null;
};


function formatDateOnly(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatDurationFromMs(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
}

export default function SessionSetsScreen() {
    const { theme } = useTheme();
    const dark = theme === "dark";

    const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

    const [loading, setLoading] = useState(true);
    const [errMsg, setErrMsg] = useState<string | null>(null);

    const [sets, setSets] = useState<SetRow[]>([]);
    const [setDuration, setSetDuration] = useState<Record<string, string>>({});

    const C = useMemo(
        () => ({
            bg: dark ? "#14161c" : "#f5f6fa",
            surface: dark ? "#1e2128" : "#ffffff",
            border: dark ? "#2b2f3a" : "#e5e7eb",
            text: dark ? "#ffffff" : "#111827",
            subtext: dark ? "#9ca3af" : "#6b7280",
            blue: dark ? "#60a5fa" : "#2563eb",
        }),
        [dark]
    );

    useEffect(() => {
        let cancelled = false;

        async function loadSets() {
            setLoading(true);
            setErrMsg(null);

            try {
                if (!sessionId) throw new Error("Missing sessionId");

                // 1) load sets for session
                const { data: setsData, error: setsErr } = await supabase
                    .from("sets")
                    .select("id, session_id, created_at, label")
                    .eq("session_id", sessionId)
                    .order("created_at", { ascending: true });

                if (setsErr) throw setsErr;

                const setRows = (setsData ?? []) as SetRow[];

                if (!cancelled) setSets(setRows);

                // 2) compute duration per set (min/max IMU time per set)
                // NOTE: This pulls (set_id,time) for all sets. If huge, see note at bottom.
                const setIds = setRows.map((s) => s.id);
                if (setIds.length === 0) {
                    if (!cancelled) setLoading(false);
                    return;
                }

                const { data: imuTimes, error: imuErr } = await supabase
                    .from("imu_samples")
                    .select("set_id, time")
                    .in("set_id", setIds);

                if (imuErr) throw imuErr;

                const minBy: Record<string, number> = {};
                const maxBy: Record<string, number> = {};

                for (const r of (imuTimes ?? []) as any[]) {
                    const id = String(r.set_id);
                    const t = Number(r.time);
                    if (!Number.isFinite(t)) continue;

                    if (minBy[id] === undefined || t < minBy[id]) minBy[id] = t;
                    if (maxBy[id] === undefined || t > maxBy[id]) maxBy[id] = t;
                }

                const nextDur: Record<string, string> = {};
                for (const id of setIds) {
                    const mn = minBy[id];
                    const mx = maxBy[id];
                    nextDur[id] =
                        Number.isFinite(mn) && Number.isFinite(mx) && mx >= mn
                            ? formatDurationFromMs(mx - mn)
                            : "—";
                }

                if (!cancelled) {
                    setSetDuration(nextDur);
                    setLoading(false);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setErrMsg(e?.message ?? "Failed to load sets");
                    setLoading(false);
                }
            }
        }

        loadSets();
        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

            {/* Header */}
            <View style={[styles.header, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Pressable onPress={() => router.back()} style={styles.backRow}>
                    <Ionicons name="arrow-back" size={18} color={C.text} />
                    <Text style={[styles.backText, { color: C.text }]}>Back</Text>
                </Pressable>

                <Text style={[styles.title, { color: C.text }]}>Sets</Text>
                <Text style={{ color: C.subtext, marginTop: 2 }}>Tap a set to view charts</Text>
            </View>

            {loading ? (
                <View style={{ padding: 16 }}>
                    <ActivityIndicator />
                    <Text style={{ marginTop: 10, color: C.subtext }}>Loading sets…</Text>
                </View>
            ) : errMsg ? (
                <View style={{ padding: 16 }}>
                    <Text style={{ color: C.text, fontWeight: "700" }}>Couldn’t load sets</Text>
                    <Text style={{ marginTop: 6, color: C.subtext }}>{errMsg}</Text>
                </View>
            ) : sets.length === 0 ? (
                <View style={{ padding: 16 }}>
                    <Text style={{ color: C.text, fontWeight: "700" }}>No sets found</Text>
                    <Text style={{ marginTop: 6, color: C.subtext }}>
                        This session has no sets in the database yet.
                    </Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                    {sets.map((st, idx) => {
                        const displayName = st.label?.trim() || `Set ${idx + 1}`;


                        return (
                            <View key={st.id} style={{ marginBottom: 16 }}>
                                <Pressable
                                    onPress={() =>
                                        router.push({
                                            pathname: "/set/[setId]" as const,
                                            params: { setId: st.id },
                                        })
                                    }
                                    style={[
                                        styles.card,
                                        { backgroundColor: C.surface, borderColor: C.border },
                                    ]}
                                >
                                    <View style={styles.topRow}>
                                        <View style={styles.inlineRow}>
                                            <Text style={{ color: C.subtext }}>📅</Text>
                                            <Text style={{ color: C.subtext, fontWeight: "600" }}>
                                                {formatDateOnly(st.created_at)}
                                            </Text>
                                        </View>

                                        <View style={styles.inlineRow}>
                                            <Text style={{ color: C.subtext }}>🕒</Text>
                                            <Text style={{ color: C.subtext, fontWeight: "600" }}>
                                                {setDuration[st.id] ?? "—"}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{ marginTop: 10 }}>
                                        <Text style={{ fontSize: 22, fontWeight: "800", color: C.text }}>
                                            {displayName}
                                        </Text>
                                        <Text style={{ marginTop: 2, color: C.subtext }}>Tap to view analytics</Text>
                                    </View>
                                </Pressable>
                            </View>
                        );
                    })}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    backText: { fontSize: 14, fontWeight: "600" },
    title: { marginTop: 8, fontSize: 22, fontWeight: "800" },

    card: {
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderWidth: StyleSheet.hairlineWidth,
    },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
