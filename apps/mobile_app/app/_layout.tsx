import { useEffect } from "react";
import { Stack } from "expo-router";
import { PaperProvider } from "react-native-paper";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { DevModeProvider } from "./context/DevModeContext";
import { LightTheme, DarkTheme } from "./theme";
import { initBleDb } from "./sqlite/bleDb";
import { GestureHandlerRootView } from "react-native-gesture-handler";

SplashScreen.preventAutoHideAsync();

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
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    initBleDb();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

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
