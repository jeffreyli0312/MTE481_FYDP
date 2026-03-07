import { useEffect } from "react";
import { Stack } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { LightTheme, DarkTheme } from "./theme";
import { initBleDb } from "./sqlite/bleDb";

function InnerLayout() {
  const { theme } = useTheme();
  const paperTheme = theme === "dark" ? DarkTheme : LightTheme;

  return (
    <PaperProvider theme={paperTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </PaperProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initBleDb();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <InnerLayout />
      </ThemeProvider>
    </AuthProvider>
  );
}
