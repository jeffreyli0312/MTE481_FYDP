import { View, Text, StyleSheet, Switch, Pressable } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();

  const isDark = theme === "dark";

  async function onLogout() {
    try {
      await signOut();
    } catch (e: any) {
      alert(e?.message ?? "Logout failed");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#14161c" : "#ffffff" }]}>
      <Text style={[styles.title, { color: isDark ? "#ffffff" : "#000000" }]}>
        Settings
      </Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: isDark ? "#e5e7eb" : "#111" }]}>
          Dark mode
        </Text>

        <Switch value={isDark} onValueChange={toggleTheme} thumbColor="#60a5fa" />
      </View>

      <Pressable
        onPress={onLogout}
        style={{
          marginTop: 24,
          backgroundColor: "#ef4444",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Log out</Text>
      </Pressable>
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
