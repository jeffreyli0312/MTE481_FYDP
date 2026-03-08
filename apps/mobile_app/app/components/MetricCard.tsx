import React, { useMemo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Card, Text } from "react-native-paper";
import { LineChart } from "react-native-chart-kit";
import { useAppTheme } from "../theme";

const screenWidth = Dimensions.get("window").width;

interface MetricCardProps {
  title: string;
  data: number[];
  labels: string[];
}

export default function MetricCard({ title, data, labels }: MetricCardProps) {
  const { colors, dark } = useAppTheme();

  const labelStep = Math.max(1, Math.floor(labels.length / 6));

  const sparseLabels = useMemo(
    () => labels.map((l, i) => (i % labelStep === 0 ? l : "")),
    [labels, labelStep],
  );

  const chartData = useMemo(
    () => ({
      labels: sparseLabels,
      datasets: [{ data, strokeWidth: 2 }],
    }),
    [data, sparseLabels],
  );

  const latest = data.length ? data[data.length - 1] : null;

  const chartConfig = {
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 2,
    color: (opacity = 1) =>
      dark
        ? `rgba(80, 156, 255, ${opacity})`
        : `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) =>
      dark
        ? `rgba(200, 200, 200, ${opacity})`
        : `rgba(55, 65, 81, ${opacity})`,
    propsForBackgroundLines: {
      strokeDasharray: "3 6",
      stroke: dark ? "#374151" : "#e5e7eb",
    },
  };

  return (
    <Card style={styles.card} mode="outlined">
      <Card.Content>
        <View style={styles.header}>
          <Text variant="titleSmall">{title}</Text>
          <Text variant="bodySmall" style={{ color: colors.primary }}>
            Latest: {latest === null ? "\u2014" : latest.toFixed(2)}
          </Text>
        </View>

        <LineChart
          data={chartData}
          width={screenWidth - 32}
          height={180}
          withInnerLines
          withOuterLines={false}
          withDots={false}
          withShadow={false}
          fromZero={false}
          chartConfig={chartConfig}
          style={{ marginTop: 4 }}
          bezier
        />

        <View style={styles.footer}>
          <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
            {data.length} samples
          </Text>
          <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
            Session chart
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  footer: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
