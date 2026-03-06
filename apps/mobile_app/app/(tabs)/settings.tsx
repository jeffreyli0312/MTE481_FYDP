import { View, StyleSheet } from "react-native";
import { Text, Switch, Button } from "react-native-paper";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../theme";

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const { colors } = useAppTheme();

  const isDark = theme === "dark";

  async function onLogout() {
    try {
      await signOut();
    } catch (e: any) {
      alert(e?.message ?? "Logout failed");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text variant="titleLarge" style={{ color: colors.onSurface }}>
        Settings
      </Text>

      <View style={styles.row}>
        <Text variant="bodyLarge" style={{ color: colors.onSurface }}>
          Dark mode
        </Text>
        <Switch value={isDark} onValueChange={toggleTheme} color={colors.primary} />
      </View>

      <Button
        mode="contained"
        onPress={onLogout}
        buttonColor={colors.error}
        textColor={colors.onError}
        style={styles.logoutBtn}
      >
        Log out
      </Button>
    </View>
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
    paddingVertical: 12,
    marginTop: 16,
  },
  logoutBtn: {
    marginTop: 24,
    borderRadius: 12,
  },
});
