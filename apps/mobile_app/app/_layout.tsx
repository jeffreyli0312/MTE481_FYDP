import { useEffect } from "react";
import { Stack } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { DevModeProvider } from "./context/DevModeContext";
import { LightTheme, DarkTheme } from "./theme";
import { initBleDb } from "./sqlite/bleDb";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <DevModeProvider>
          <ThemeProvider>
            <InnerLayout />
          </ThemeProvider>
        </DevModeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
