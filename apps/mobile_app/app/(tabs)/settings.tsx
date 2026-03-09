import { View, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Switch, Divider } from "react-native-paper";
import { useTheme } from "../context/ThemeContext";
import { useDevMode } from "../context/DevModeContext";
import { useAppTheme } from "../theme";

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();
  const { devMode, toggleDevMode } = useDevMode();
  const { colors } = useAppTheme();

  const isDark = theme === "dark";

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 }}>
      <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "bold" }}>
        Settings
      </Text>

      <View style={styles.row}>
        <Text variant="bodyLarge" style={{ color: colors.onSurface }}>
          Dark mode
        </Text>
        <Switch value={isDark} onValueChange={toggleTheme} color={colors.primary} />
      </View>

      <Divider style={{ marginVertical: 8 }} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" style={{ color: colors.onSurface }}>
            Developer mode
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
            Shows the Database tab for inspecting local data
          </Text>
        </View>
        <Switch value={devMode} onValueChange={toggleDevMode} color={colors.primary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
});
