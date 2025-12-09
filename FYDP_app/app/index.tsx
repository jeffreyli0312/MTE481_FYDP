import React from "react";
import { useTheme } from "./context/ThemeContext";

import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
} from "react-native";
import { LineChart } from "react-native-chart-kit";

const screenWidth = Dimensions.get("window").width;

// Hardcoded sample data for 4 sensors / metrics
const sampleData = {
  sensor1: [10, 14, 13, 18, 20, 22, 21],
  sensor2: [30, 28, 32, 35, 34, 36, 39],
  sensor3: [5, 7, 6, 8, 9, 7, 10],
  sensor4: [60, 62, 61, 65, 67, 66, 70],
};

const labels = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

export default function Index() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: dark ? "#14161c" : "#f5f5f5",
      }}
    >
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      {/* Top title */}
      <Text
        style={{
          color: dark ? "#fff" : "#000",
          fontSize: 22,
          fontWeight: "600",
          padding: 12,
        }}
      >
        Dashboard
      </Text>

      {/* Inner layout that also reacts to theme */}
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: dark ? "#14161c" : "#f5f5f5" },
        ]}
      >
        <View
          style={[
            styles.headerContainer,
            { borderBottomColor: dark ? "#2b2f3a" : "#e5e7eb" },
          ]}
        >
          <Text
            style={[
              styles.appTitle,
              { color: dark ? "#ffffff" : "#111827" },
            ]}
          >
            FYDP Data Monitor
          </Text>
          <Text
            style={[
              styles.appSubtitle,
              { color: dark ? "#9ca3af" : "#6b7280" },
            ]}
          >
            Live Sensor Dashboard (demo)
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <MetricCard
            title="Sensor 1 • Force (N)"
            data={sampleData.sensor1}
            dark={dark}
          />
          <MetricCard
            title="Sensor 2 • Position (mm)"
            data={sampleData.sensor2}
            dark={dark}
          />
          <MetricCard
            title="Sensor 3 • Angle (°)"
            data={sampleData.sensor3}
            dark={dark}
          />
          <MetricCard
            title="Sensor 4 • Load (%)"
            data={sampleData.sensor4}
            dark={dark}
          />
        </ScrollView>
      </SafeAreaView>
    </SafeAreaView>
  );
}

interface MetricCardProps {
  title: string;
  data: number[];
  dark: boolean; // 👈 new prop
}

function MetricCard({ title, data, dark }: MetricCardProps) {
  const chartData = {
    labels,
    datasets: [
      {
        data,
        strokeWidth: 2,
      },
    ],
  };

  // Dynamic chart config based on theme
  const chartConfig = {
    backgroundGradientFrom: dark ? "#1e2128" : "#ffffff",
    backgroundGradientTo: dark ? "#1e2128" : "#ffffff",
    decimalPlaces: 1,
    color: (opacity = 1) =>
      dark
        ? `rgba(80, 156, 255, ${opacity})`
        : `rgba(37, 99, 235, ${opacity})`, // slightly different blue in light mode
    labelColor: (opacity = 1) =>
      dark
        ? `rgba(200, 200, 200, ${opacity})`
        : `rgba(55, 65, 81, ${opacity})`, // gray-700-ish
    propsForBackgroundLines: {
      strokeDasharray: "3 6",
      stroke: dark ? "#374151" : "#e5e7eb",
    },
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: dark ? "#1e2128" : "#ffffff",
          shadowOpacity: dark ? 0.25 : 0.1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text
          style={[
            styles.cardTitle,
            { color: dark ? "#e5e7eb" : "#111827" },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.cardValue,
            { color: dark ? "#60a5fa" : "#2563eb" },
          ]}
        >
          Latest: {data[data.length - 1].toFixed(1)}
        </Text>
      </View>

      <LineChart
        data={chartData}
        width={screenWidth - 32} // padding on sides
        height={180}
        withInnerLines={true}
        withOuterLines={false}
        withDots={false}
        withShadow={false}
        fromZero
        chartConfig={chartConfig}
        style={styles.chart}
        bezier
      />

      <View style={styles.footerRow}>
        <Text
          style={[
            styles.footerText,
            { color: dark ? "#9ca3af" : "#6b7280" },
          ]}
        >
          Last 7 samples
        </Text>
        <Text
          style={[
            styles.footerTextMuted,
            { color: dark ? "#6b7280" : "#9ca3af" },
          ]}
        >
          Demo data (hardcoded)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  appSubtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  card: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  chart: {
    marginTop: 4,
  },
  footerRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 12,
  },
  footerTextMuted: {
    fontSize: 11,
  },
});
