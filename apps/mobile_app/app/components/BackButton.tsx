import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";

interface BackButtonProps {
  onPress: () => void;
  label?: string;
}

export default function BackButton({ onPress, label = "Back" }: BackButtonProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Feather name="arrow-left" size={18} color={colors.onSurface} />
      <Text variant="labelLarge" style={{ color: colors.onSurface }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
