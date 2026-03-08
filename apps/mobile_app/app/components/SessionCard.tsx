import React from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";

interface SessionCardProps {
  dateLabel: string;
  durationLabel: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}

export default function SessionCard({
  dateLabel,
  durationLabel,
  title,
  subtitle,
  onPress,
}: SessionCardProps) {
  const { colors } = useAppTheme();

  return (
    <Card style={styles.card} mode="outlined" onPress={onPress}>
      <Card.Content>
        <View style={styles.topRow}>
          <View style={styles.inlineRow}>
            <Feather name="calendar" size={14} color={colors.onSurfaceVariant} />
            <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
              {dateLabel}
            </Text>
          </View>

          <View style={styles.inlineRow}>
            <Feather name="clock" size={14} color={colors.onSurfaceVariant} />
            <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
              {durationLabel}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text
            variant="headlineSmall"
            style={{ color: colors.onSurface, fontWeight: "700" }}
          >
            {title}
          </Text>
          {subtitle != null && (
            <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
              {subtitle}
            </Text>
          )}
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
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
