import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "./context/ThemeContext";

export default function HistoryScreen() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: dark ? "#14161c" : "#ffffff" },
      ]}
    >
      <Text
        style={[
          styles.title,
          { color: dark ? "#ffffff" : "#000000" },
        ]}
      >
        History
      </Text>

      <Text
        style={[
          styles.text,
          { color: dark ? "#9ca3af" : "#4b5563" },
        ]}
      >
        This is where you can show past sessions, saved data, etc.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
  },
});
