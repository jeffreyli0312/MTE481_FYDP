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
  ax: number;
};

type SetData = {
  name: string;
  avgForce: number;
  maxForce: number;
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
  if (!Number.isFinite(ms) || ms <= 0) return "0m 0s";
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

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

  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [duration, setDuration] = useState("0m 0s");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr(null);

        const { data, error } = await supabase
          .from("imu_samples")
          .select("time, ax")
          .eq("session_id", sessionId)
          .order("time", { ascending: true });

        if (error) throw error;

        const rows = (data ?? []).map((r: any) => ({
          time: Number(r.time),
          ax: Number(r.ax),
        }));

        if (rows.length >= 2) {
          const durMs = rows[rows.length - 1].time - rows[0].time;
          if (!cancelled) setDuration(formatDurationFromMs(durMs));
        }

        if (!cancelled) setSamples(rows);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (sessionId) load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* -------------------- Stats -------------------- */
  const forces = useMemo(
    () => samples.map((s) => Math.abs(s.ax)).filter(Number.isFinite),
    [samples]
  );

  const avgForce = useMemo(() => {
    if (!forces.length) return 0;
    return forces.reduce((a, b) => a + b, 0) / forces.length;
  }, [forces]);

  const maxForce = useMemo(() => (forces.length ? Math.max(...forces) : 0), [forces]);

  const consistency = useMemo(() => {
    if (forces.length < 2) return 0;
    const range = Math.max(...forces) - Math.min(...forces);
    const score = 100 - range / 2;
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [forces]);

  const consistencyLabel =
    consistency > 80 ? "Excellent" : consistency > 60 ? "Good" : "Needs Work";

  /* -------------------- Sets (placeholder) -------------------- */
  // NOTE: Chart-kit BarChart isn't a true grouped bar chart like Recharts.
  // We'll show Average Force by set (placeholder until you have real set boundaries).
  const sets: SetData[] = useMemo(() => {
    const a = avgForce;
    const m = maxForce;
    return [
      { name: "Set 1", avgForce: a * 0.9, maxForce: m },
      { name: "Set 2", avgForce: a, maxForce: m * 0.95 },
    ];
  }, [avgForce, maxForce]);

  // Show ONLY avgForce as bars (reliable in chart-kit).
  const barData = useMemo(
    () => ({
      labels: sets.map((s) => s.name),
      datasets: [{ data: sets.map((s) => Number.isFinite(s.avgForce) ? s.avgForce : 0) }],
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
        dark ? `rgba(96, 165, 250, ${clamp01(opacity)})` : `rgba(37, 99, 235, ${clamp01(opacity)})`,
      labelColor: (opacity = 1) =>
        dark ? `rgba(156, 163, 175, ${clamp01(opacity)})` : `rgba(107, 114, 128, ${clamp01(opacity)})`,
      propsForBackgroundLines: {
        strokeDasharray: "3 6",
        stroke: dark ? "#374151" : "#e5e7eb",
      },
    }),
    [dark]
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

        {/* Set Comparison */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>Set-by-Set Comparison</Text>

          <BarChart
            data={barData}
            width={screenWidth - 32}
            height={220}
            yAxisLabel="" // REQUIRED by chart-kit types
            yAxisSuffix="N"
            fromZero
            chartConfig={chartConfig}
            style={{ borderRadius: 12 }}
          />

          <View style={{ marginTop: 8 }}>
            <Text style={{ color: C.subtext, fontSize: 12 }}>
              Showing <Text style={{ color: C.text, fontWeight: "700" }}>Average Force</Text> (chart-kit limitation for grouped bars).
            </Text>
          </View>
        </View>

        {/* Consistency */}
        <View style={styles.consistencyCard}>
          <Text style={styles.consistencyTitle}>⚡ Consistency Score</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Text style={styles.consistencyValue}>{consistency}%</Text>
              <Text style={styles.consistencyLabel}>{consistencyLabel}</Text>
            </View>
            <Text style={styles.consistencySideText}>Measures force stability{"\n"}across all sets</Text>
          </View>
        </View>

        {/* Insights */}
        <View style={[styles.insightCard, { backgroundColor: C.surface, borderColor: dark ? "#1d4ed8" : "#bfdbfe" }]}>
          <Text style={[styles.cardTitle, { color: C.text }]}>💡 Performance Insights</Text>

          <Insight index={1} text="Your force output varied significantly. Focus on maintaining consistent form and tempo throughout each set." colors={C} />
          <Insight index={2} text="Light volume today. Try to aim for at least 3–5 sets to maximize your training effectiveness." colors={C} />
          <Insight index={3} text="Building your foundation. Focus on form first, then gradually increase weight as you become more comfortable." colors={C} />
          <Insight index={4} text="Some fatigue is visible in later sets. Ensure adequate rest between sets and proper nutrition." colors={C} />
        </View>

        {/* Next Steps */}
        <View style={[styles.nextCard, { backgroundColor: dark ? "#0b2b1a" : "#ecfdf5", borderColor: dark ? "#14532d" : "#bbf7d0" }]}>
          <Text style={[styles.cardTitle, { color: dark ? "#d1fae5" : "#065f46" }]}>Next Steps</Text>

          <Bullet text="Rest for 48–72 hours before training this muscle group again" color={dark ? "#d1fae5" : "#064e3b"} />
          <Bullet text="Consider adding 5–10% more weight next session if consistency stays above 70%" color={dark ? "#d1fae5" : "#064e3b"} />
          <Bullet text="Focus on maintaining proper form throughout all sets" color={dark ? "#d1fae5" : "#064e3b"} />
        </View>

        {/* Optional: Force over time line chart */}
        {forces.length >= 2 && (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.cardTitle, { color: C.text }]}>Force Over Time</Text>
            <LineChart
              data={{
                labels: samples
                  .map((s) => (s.time / 1000).toFixed(0))
                  .map((l, i) => (i % Math.max(1, Math.floor(samples.length / 6)) === 0 ? l : "")),
                datasets: [{ data: forces }],
              }}
              width={screenWidth - 32}
              height={220}
              withDots={false}
              withShadow={false}
              withInnerLines
              withOuterLines={false}
              chartConfig={chartConfig}
              style={{ borderRadius: 12 }}
              bezier
            />
          </View>
        )}
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
