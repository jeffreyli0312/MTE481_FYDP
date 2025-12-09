import { View, Text, StyleSheet, Switch } from "react-native";
import { useTheme } from "./context/ThemeContext";

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? "#14161c" : "#ffffff" },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: isDark ? "#ffffff" : "#000000" },
        ]}
      >
        Settings
      </Text>

      <View style={styles.row}>
        <Text
          style={[
            styles.label,
            { color: isDark ? "#e5e7eb" : "#111" },
          ]}
        >
          Dark mode
        </Text>

        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          thumbColor="#60a5fa"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  label: {
    fontSize: 16,
  },
});
