import React, { useEffect, useMemo, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    ScrollView,
    StyleSheet,
    Dimensions,
    ActivityIndicator,
    Pressable,
    StatusBar,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { LineChart, BarChart } from "react-native-chart-kit";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../context/ThemeContext";

const screenWidth = Dimensions.get("window").width;

type SampleRow = {
    time: number; // ms
    emg?: number | null;
    gyrx?: number | null;
};

type Point = { time: number; value: number };

type SetData = {
    name: string;
    avgForce: number;
    maxForce: number;
};

type MetricKey = "force" | "yaw";

function formatDateOnly(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatDurationFromMs(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return "0m 0s";
    const sec = Math.floor(ms / 1000);
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Fetches ALL rows matching the query in pages (Supabase range pagination).
 * Works for large result sets (e.g., 40,000+ rows) without truncation.
 */
async function fetchAllPages<T>(
    makeQuery: (from: number, to: number) => ReturnType<typeof supabase.from>,
    pageSize = 1000
): Promise<T[]> {
    const out: T[] = [];
    let from = 0;

    while (true) {
        const to = from + pageSize - 1;

        const { data, error } = (await (makeQuery(from, to) as any)) as {
            data: T[] | null;
            error: any;
        };

        if (error) throw error;

        const rows = data ?? [];
        out.push(...rows);

        if (rows.length < pageSize) break;

        from += pageSize;
    }

    return out;
}

function downsample<T>(arr: T[], max: number) {
    if (!Number.isFinite(max) || max === Infinity) return arr;
    if (arr.length <= max) return arr;

    const step = Math.ceil(arr.length / max);
    const out: T[] = [];
    for (let i = 0; i < arr.length; i += step) out.push(arr[i]);

    // ensure last element included
    if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
    return out;
}

// Used to downsample both EMG and IMU data
function downsampleMinMax(points: Point[], maxPoints: number): Point[] {
    if (!Number.isFinite(maxPoints) || maxPoints === Infinity) return points;
    if (maxPoints <= 2 || points.length <= maxPoints) return points;

    // We will output ~2 points per bucket (min & max), so buckets ≈ maxPoints/2
    const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
    const n = points.length;
    const bucketSize = Math.ceil(n / bucketCount);

    const out: Point[] = [];

    for (let b = 0; b < bucketCount; b++) {
        const start = b * bucketSize;
        const end = Math.min(n, start + bucketSize);
        if (start >= end) break;

        let minP = points[start];
        let maxP = points[start];

        for (let i = start + 1; i < end; i++) {
            const p = points[i];
            if (p.value < minP.value) minP = p;
            if (p.value > maxP.value) maxP = p;
        }

        // Push in time order so the line doesn't zigzag
        if (minP.time <= maxP.time) {
            out.push(minP, maxP);
        } else {
            out.push(maxP, minP);
        }
    }

    // Ensure last point is included
    const last = points[points.length - 1];
    if (out.length === 0 || out[out.length - 1].time !== last.time) out.push(last);

    // If we somehow exceeded maxPoints, trim
    return out.length > maxPoints ? out.slice(0, maxPoints) : out;
}

// Used to smooth EMG data
function rmsEnvelope(points: Point[], windowSize = 25): Point[] {
    if (windowSize <= 1) return points;
    const out: Point[] = [];
    let sumSq = 0;
    const buf: number[] = [];

    for (let i = 0; i < points.length; i++) {
        const v = points[i].value;
        const vv = v * v;

        buf.push(vv);
        sumSq += vv;

        if (buf.length > windowSize) {
            sumSq -= buf.shift()!;
        }

        const rms = Math.sqrt(sumSq / buf.length);
        out.push({ time: points[i].time, value: rms });
    }

    return out;
}

// Used to smooth IMU data
function emaSmooth(points: Point[], alpha = 0.2): Point[] {
    if (points.length === 0) return points;
    const a = Math.max(0.001, Math.min(0.999, alpha));

    const out: Point[] = [];
    let prev = points[0].value;
    out.push({ time: points[0].time, value: prev });

    for (let i = 1; i < points.length; i++) {
        const v = points[i].value;
        const s = a * v + (1 - a) * prev;
        prev = s;
        out.push({ time: points[i].time, value: s });
    }

    return out;
}

// Used to calculate x-axis for charts, in seconds
function formatSeconds(ms: number, decimals = 1) {
    if (!Number.isFinite(ms)) return "";
    return (ms / 1000).toFixed(decimals);
}



export default function SessionAnalyticsScreen() {
    const { theme } = useTheme();
    const dark = theme === "dark";

    const { sessionId, label, created_at } = useLocalSearchParams<{
        sessionId: string;
        label?: string;
        created_at?: string;
    }>();

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // merged union rows (good for overall duration + unified view)
    const [samples, setSamples] = useState<SampleRow[]>([]);
    const [duration, setDuration] = useState("0m 0s");

    // keep raw series separately so EMG and IMU can have different lengths/widths
    const [emgSeries, setEmgSeries] = useState<Point[]>([]);
    const [imuSeries, setImuSeries] = useState<Point[]>([]);

    // chart selection
    const [metric, setMetric] = useState<MetricKey>("force");
    const metricOptions: { key: MetricKey; label: string }[] = [
        { key: "force", label: "Force" },
        { key: "yaw", label: "Yaw" },
    ];

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setErr(null);

                if (!sessionId) throw new Error("Missing sessionId");

                // Fetch ALL EMG rows for this session (paged)
                const emgData = await fetchAllPages<{ time: any; emg_value: any }>(
                    (from, to) =>
                    (supabase
                        .from("emg_samples")
                        .select("time, emg_value")
                        .eq("session_id", sessionId)
                        .order("time", { ascending: true })
                        .range(from, to) as any),
                    1000
                );

                // Fetch ALL IMU rows for this session (paged)
                const imuData = await fetchAllPages<{ time: any; gyrx: any }>(
                    (from, to) =>
                    (supabase
                        .from("imu_samples")
                        .select("time, gyrx")
                        .eq("session_id", sessionId)
                        .order("time", { ascending: true })
                        .range(from, to) as any),
                    1000
                );

                // Build separate raw series (these can have different lengths)
                const emgAll: Point[] = (emgData ?? [])
                    .map((r) => ({ time: Number(r.time), value: Number(r.emg_value) }))
                    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
                    .sort((a, b) => a.time - b.time);

                const imuAll: Point[] = (imuData ?? [])
                    .map((r) => ({ time: Number(r.time), value: Number(r.gyrx) }))
                    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
                    .sort((a, b) => a.time - b.time);

                // Merge by time so we keep ALL possible rows (union of timestamps)
                const emgMap = new Map<number, number>();
                for (const p of emgAll) emgMap.set(p.time, p.value);

                const imuMap = new Map<number, number>();
                for (const p of imuAll) imuMap.set(p.time, p.value);

                const times = Array.from(
                    new Set<number>([...emgAll.map((p) => p.time), ...imuAll.map((p) => p.time)])
                ).sort((a, b) => a - b);

                const rows: SampleRow[] = times.map((t) => ({
                    time: t,
                    emg: emgMap.has(t) ? emgMap.get(t)! : null,
                    gyrx: imuMap.has(t) ? imuMap.get(t)! : null,
                }));

                // Duration can be based on merged union OR (better) on earliest/latest across BOTH:
                const firstTime = times[0];
                const lastTime = times[times.length - 1];
                if (Number.isFinite(firstTime) && Number.isFinite(lastTime) && times.length >= 2) {
                    const durMs = lastTime - firstTime;
                    if (!cancelled) setDuration(formatDurationFromMs(durMs));
                } else {
                    if (!cancelled) setDuration("0m 0s");
                }

                if (!cancelled) {
                    setEmgSeries(emgAll);
                    setImuSeries(imuAll);
                    setSamples(rows);
                }
            } catch (e: any) {
                if (!cancelled) setErr(e?.message ?? "Failed to load session");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    /* -------------------- Display (downsampling) -------------------- */

    const baseWidth = screenWidth - 32;

    /**
     * Rendering 40,000 points in react-native-chart-kit can be slow / crash on devices.
     * We still FETCH all rows, but downsample for DISPLAY.
     */
    const displayMaxPoints = 2000;

    const displayEmg = useMemo(() => {
        const ds = downsampleMinMax(emgSeries, displayMaxPoints);
        return rmsEnvelope(ds, 25); // try 10, 25, 50
    }, [emgSeries]);

    const displayImu = useMemo(() => {
        const ds = downsampleMinMax(imuSeries, displayMaxPoints);
        return emaSmooth(ds, 0.25); // try 0.15 (more smooth) to 0.35 (less smooth)
    }, [imuSeries]);

    // DIFFERENT widths per graph (based on that series' display length)
    const emgChartWidth = useMemo(
        () => Math.max(baseWidth, displayEmg.length * 6),
        [baseWidth, displayEmg.length]
    );
    const imuChartWidth = useMemo(
        () => Math.max(baseWidth, displayImu.length * 6),
        [baseWidth, displayImu.length]
    );

    const selectedDisplay = metric === "force" ? displayEmg : displayImu;
    const selectedChartWidth = metric === "force" ? emgChartWidth : imuChartWidth;

    const selectedSeries = useMemo(() => selectedDisplay.map((p) => p.value), [selectedDisplay]);

    const selectedTitle =
        metric === "force" ? "EMG Over Time" : "Gyro X Over Time (Shoulder Flare)";

    const labelStep = useMemo(() => Math.max(1, Math.floor(selectedDisplay.length / 100)), [selectedDisplay.length]);

    /* -------------------- Stats (use ALL rows, not downsampled) -------------------- */

    const allForcesFinite = useMemo(
        () =>
            samples
                .map((s) => s.emg)
                .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
        [samples]
    );

    const avgForce = useMemo(() => {
        if (!allForcesFinite.length) return 0;
        return allForcesFinite.reduce((a, b) => a + b, 0) / allForcesFinite.length;
    }, [allForcesFinite]);

    const maxForce = useMemo(
        () => (allForcesFinite.length ? Math.max(...allForcesFinite) : 0),
        [allForcesFinite]
    );

    const consistency = useMemo(() => {
        if (allForcesFinite.length < 2) return 0;
        const range = Math.max(...allForcesFinite) - Math.min(...allForcesFinite);
        const score = 100 - range / 2;
        return Math.max(0, Math.min(100, Math.round(score)));
    }, [allForcesFinite]);

    const consistencyLabel =
        consistency > 80 ? "Excellent" : consistency > 60 ? "Good" : "Needs Work";

    /* -------------------- Sets (placeholder) -------------------- */
    const sets: SetData[] = useMemo(() => {
        const a = avgForce;
        const m = maxForce;
        return [
            { name: "Set 1", avgForce: a * 0.9, maxForce: m },
            { name: "Set 2", avgForce: a, maxForce: m * 0.95 },
        ];
    }, [avgForce, maxForce]);

    const barData = useMemo(
        () => ({
            labels: sets.map((s) => s.name),
            datasets: [{ data: sets.map((s) => (Number.isFinite(s.avgForce) ? s.avgForce : 0)) }],
        }),
        [sets]
    );

    /* -------------------- Theme Tokens -------------------- */
    const C = {
        bg: dark ? "#14161c" : "#f5f6fa",
        surface: dark ? "#1e2128" : "#ffffff",
        border: dark ? "#2b2f3a" : "#e5e7eb",
        text: dark ? "#ffffff" : "#111827",
        subtext: dark ? "#9ca3af" : "#6b7280",
        muted: dark ? "#6b7280" : "#9ca3af",
        blue: dark ? "#60a5fa" : "#2563eb",
        green: "#22c55e",
    };

    const chartConfig = useMemo(
        () => ({
            backgroundGradientFrom: C.surface,
            backgroundGradientTo: C.surface,
            decimalPlaces: 1,
            color: (opacity = 1) =>
                dark
                    ? `rgba(96, 165, 250, ${clamp01(opacity)})`
                    : `rgba(37, 99, 235, ${clamp01(opacity)})`,
            labelColor: (opacity = 1) =>
                dark
                    ? `rgba(156, 163, 175, ${clamp01(opacity)})`
                    : `rgba(107, 114, 128, ${clamp01(opacity)})`,
            propsForBackgroundLines: {
                strokeDasharray: "3 6",
                stroke: dark ? "#374151" : "#e5e7eb",
            },
        }),
        [dark, C.surface]
    );

    if (loading) {
        return (
            <SafeAreaView style={[styles.center, { backgroundColor: C.bg }]}>
                <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
                <ActivityIndicator />
                <Text style={{ marginTop: 10, color: C.subtext }}>Loading…</Text>
            </SafeAreaView>
        );
    }

    if (err) {
        return (
            <SafeAreaView style={[styles.center, { backgroundColor: C.bg }]}>
                <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
                <Text style={{ color: C.text, fontWeight: "700" }}>Couldn’t load</Text>
                <Text style={{ marginTop: 6, color: C.subtext }}>{err}</Text>
                <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
                    <Text style={{ color: C.blue, fontWeight: "700" }}>Go back</Text>
                </Pressable>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

            {/* Header */}
            <View style={[styles.header, { backgroundColor: C.surface, borderColor: C.border }]}>
                <Pressable onPress={() => router.back()} style={styles.backRow}>
                    <Ionicons name="arrow-back" size={18} color={C.text} />
                    <Text style={[styles.backText, { color: C.text }]}>Back</Text>
                </Pressable>

                <View style={styles.headerRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.title, { color: C.text }]}>Session Analytics</Text>
                        <Text style={[styles.subtitle, { color: C.subtext }]}>
                            {(label as string) ?? "Bench Press"} • {formatDateOnly(created_at)}
                        </Text>
                        <Text style={{ marginTop: 6, color: C.subtext, fontSize: 12 }}>
                            Loaded{" "}
                            <Text style={{ color: C.text, fontWeight: "800" }}>{samples.length}</Text> merged rows •
                            EMG{" "}
                            <Text style={{ color: C.text, fontWeight: "800" }}>{emgSeries.length}</Text> • IMU{" "}
                            <Text style={{ color: C.text, fontWeight: "800" }}>{imuSeries.length}</Text>
                        </Text>
                    </View>

                    <View style={[styles.badge, { backgroundColor: C.green }]}>
                        <Text style={styles.badgeText}>Completed</Text>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                {/* Overview Cards */}
                <View style={styles.statsGrid}>
                    <StatCard title="Duration" value={duration} colors={C} />
                    <StatCard title="Total Sets" value="2" colors={C} />
                    <StatCard title="Avg Force" value={avgForce.toFixed(1)} unit="N" colors={C} />
                    <StatCard title="Max Force" value={maxForce.toFixed(1)} unit="N" colors={C} />
                </View>

                {/* Chart selector */}
                <View style={[styles.segment, { backgroundColor: C.surface, borderColor: C.border }]}>
                    {metricOptions.map((opt) => {
                        const active = metric === opt.key;
                        return (
                            <Pressable
                                key={opt.key}
                                onPress={() => setMetric(opt.key)}
                                style={[
                                    styles.segmentBtn,
                                    {
                                        backgroundColor: active ? C.blue : "transparent",
                                        borderColor: C.border,
                                    },
                                ]}
                            >
                                <Text style={{ color: active ? "#fff" : C.text, fontWeight: "700" }}>
                                    {opt.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {/* ONE chart at a time */}
                {selectedSeries.length >= 2 && (
                    <View
                        style={[
                            styles.card,
                            {
                                backgroundColor: C.surface,
                                borderColor: C.border,
                                borderRadius: 12,
                                overflow: "hidden",
                            },
                        ]}
                    >
                        <Text style={[styles.cardTitle, { color: C.text }]}>{selectedTitle}</Text>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={true}
                            indicatorStyle={dark ? "white" : "black"}
                            contentContainerStyle={{ paddingBottom: 6 }}
                        >
                            <View style={{ marginTop: 10 }}>
                                {/* Row = Y label + scrollable chart */}
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <View style={{ width: 18, alignItems: "center", marginRight: 8 }}>
                                        <Text
                                            style={{
                                                color: C.subtext,
                                                fontSize: 12,
                                                transform: [{ rotate: "-90deg" }],
                                                width: 220, // matches chart height so rotation has room
                                                textAlign: "center",
                                            }}
                                        >
                                            {metric === "force" ? "EMG (a.u.)" : "Gyro X (deg/s)"}
                                        </Text>
                                    </View>

                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator
                                        indicatorStyle={dark ? "white" : "black"}
                                    >
                                        <LineChart
                                            data={{
                                                labels: selectedDisplay.map((p, i) =>
                                                    i % labelStep === 0 ? formatSeconds(p.time, 2) : ""
                                                ),
                                                datasets: [{ data: selectedSeries as any }],
                                            }}
                                            width={selectedChartWidth}
                                            height={220}
                                            withDots={false}
                                            withShadow={false}
                                            withInnerLines
                                            withOuterLines={false}
                                            chartConfig={{ ...chartConfig, paddingRight: 12 }}
                                            style={{ borderRadius: 12 }}
                                        />
                                    </ScrollView>
                                </View>

                                {/* X label ALWAYS below chart */}
                                <View
                                    style={{
                                        marginTop: 6,
                                        marginLeft: 180, // same gutter as Y-axis label
                                    }}
                                >
                                    <View
                                        style={{
                                            width: selectedChartWidth - 180,
                                            flexDirection: "row",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        {Array.from({ length: 15 }).map((_, i) => (
                                            <Text
                                                key={i}
                                                style={{
                                                    color: C.subtext,
                                                    fontSize: 12,
                                                }}
                                            >
                                                Time (s)
                                            </Text>
                                        ))}
                                    </View>
                                </View>


                            </View>


                        </ScrollView>

                        {/* <Text style={{ marginTop: 8, color: C.subtext, fontSize: 12 }}>
                            Note: chart is downsampled for performance. Stats above use all rows.
                        </Text> */}
                    </View>
                )}

                {/* Consistency */}
                <View style={styles.consistencyCard}>
                    <Text style={styles.consistencyTitle}>⚡ Consistency Score</Text>
                    <View
                        style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "flex-end",
                        }}
                    >
                        <View>
                            <Text style={styles.consistencyValue}>{consistency}%</Text>
                            <Text style={styles.consistencyLabel}>{consistencyLabel}</Text>
                        </View>
                        <Text style={styles.consistencySideText}>
                            Measures force stability{"\n"}across all sets
                        </Text>
                    </View>
                </View>

                {/* Insights */}
                <View
                    style={[
                        styles.insightCard,
                        { backgroundColor: C.surface, borderColor: dark ? "#1d4ed8" : "#bfdbfe" },
                    ]}
                >
                    <Text style={[styles.cardTitle, { color: C.text }]}>💡 Performance Insights</Text>

                    <Insight
                        index={1}
                        text="Your force output varied significantly. Focus on maintaining consistent form and tempo throughout each set."
                        colors={C}
                    />
                    <Insight
                        index={2}
                        text="Light volume today. Try to aim for at least 3–5 sets to maximize your training effectiveness."
                        colors={C}
                    />
                    <Insight
                        index={3}
                        text="Building your foundation. Focus on form first, then gradually increase weight as you become more comfortable."
                        colors={C}
                    />
                    <Insight
                        index={4}
                        text="Some fatigue is visible in later sets. Ensure adequate rest between sets and proper nutrition."
                        colors={C}
                    />
                </View>

                {/* Next Steps */}
                <View
                    style={[
                        styles.nextCard,
                        {
                            backgroundColor: dark ? "#0b2b1a" : "#ecfdf5",
                            borderColor: dark ? "#14532d" : "#bbf7d0",
                        },
                    ]}
                >
                    <Text style={[styles.cardTitle, { color: dark ? "#d1fae5" : "#065f46" }]}>
                        Next Steps
                    </Text>

                    <Bullet
                        text="Rest for 48–72 hours before training this muscle group again"
                        color={dark ? "#d1fae5" : "#064e3b"}
                    />
                    <Bullet
                        text="Consider adding 5–10% more weight next session if consistency stays above 70%"
                        color={dark ? "#d1fae5" : "#064e3b"}
                    />
                    <Bullet
                        text="Focus on maintaining proper form throughout all sets"
                        color={dark ? "#d1fae5" : "#064e3b"}
                    />
                </View>

                {/* Set-by-Set Comparison */}
                <View
                    style={[
                        styles.card,
                        {
                            backgroundColor: C.surface,
                            borderColor: C.border,
                            borderRadius: 12,
                            overflow: "hidden",
                        },
                    ]}
                >
                    <Text style={[styles.cardTitle, { color: C.text }]}>
                        Set-by-Set Comparison (Placeholder, Optional Chart)
                    </Text>

                    <View style={{ width: screenWidth - 32, alignSelf: "center" }}>
                        <BarChart
                            data={barData}
                            width={screenWidth - 32}
                            height={220}
                            yAxisLabel=""
                            yAxisSuffix="N"
                            fromZero
                            chartConfig={{ ...chartConfig, paddingRight: 12 }}
                            style={{ borderRadius: 12 }}
                        />
                    </View>

                    <View style={{ marginTop: 8 }}>
                        <Text style={{ color: C.subtext, fontSize: 12 }}>
                            Showing <Text style={{ color: C.text, fontWeight: "700" }}>Average Force</Text>{" "}
                            (chart-kit limitation for grouped bars).
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* -------------------- Components -------------------- */

function StatCard({
    title,
    value,
    unit,
    colors,
}: {
    title: string;
    value: string;
    unit?: string;
    colors: {
        surface: string;
        border: string;
        text: string;
        subtext: string;
    };
}) {
    return (
        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statTitle, { color: colors.subtext }]}>{title}</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
                {value}
                {unit ? <Text style={[styles.unit, { color: colors.subtext }]}> {unit}</Text> : null}
            </Text>
        </View>
    );
}

function Insight({
    index,
    text,
    colors,
}: {
    index: number;
    text: string;
    colors: { text: string; subtext: string };
}) {
    return (
        <View style={styles.insightRow}>
            <View style={styles.insightIndex}>
                <Text style={styles.insightIndexText}>{index}</Text>
            </View>
            <Text style={[styles.insightText, { color: colors.text }]}>{text}</Text>
        </View>
    );
}

function Bullet({ text, color }: { text: string; color: string }) {
    return (
        <View style={{ flexDirection: "row", marginTop: 8 }}>
            <Text style={{ marginRight: 8, color }}>•</Text>
            <Text style={{ flex: 1, color, fontSize: 13 }}>{text}</Text>
        </View>
    );
}

/* -------------------- Styles -------------------- */

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },

    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    backText: { fontSize: 14, fontWeight: "600" },

    headerRow: {
        marginTop: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    title: { fontSize: 22, fontWeight: "800" },
    subtitle: { fontSize: 13 },

    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },

    statsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
    },
    statCard: {
        borderRadius: 12,
        padding: 12,
        width: "48%",
        borderWidth: 1,
    },
    statTitle: { fontSize: 13, fontWeight: "600" },
    statValue: { fontSize: 20, fontWeight: "800", marginTop: 6 },
    unit: { fontSize: 12, fontWeight: "600" },

    card: {
        borderRadius: 12,
        padding: 12,
        marginTop: 16,
        borderWidth: 1,
    },
    cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 10 },

    // segmented control
    segment: {
        marginTop: 16,
        borderWidth: 1,
        borderRadius: 12,
        padding: 6,
        flexDirection: "row",
        gap: 6,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        borderRadius: 10,
        borderWidth: 1,
    },

    consistencyCard: {
        marginTop: 16,
        borderRadius: 12,
        padding: 16,
        backgroundColor: "#9333ea",
    },
    consistencyTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
    consistencyValue: { color: "#fff", fontSize: 44, fontWeight: "900", marginTop: 8 },
    consistencyLabel: { color: "#e9d5ff", fontSize: 12, marginTop: 2, fontWeight: "700" },
    consistencySideText: { color: "#e9d5ff", fontSize: 12, textAlign: "right" },

    insightCard: {
        borderRadius: 12,
        padding: 12,
        marginTop: 16,
        borderWidth: 1,
    },
    insightRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 10 },
    insightIndex: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#dbeafe",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
        marginTop: 2,
    },
    insightIndexText: { color: "#1d4ed8", fontSize: 12, fontWeight: "800" },
    insightText: { flex: 1, fontSize: 13, lineHeight: 18 },

    nextCard: {
        borderRadius: 12,
        padding: 12,
        marginTop: 16,
        borderWidth: 1,
    },
});
