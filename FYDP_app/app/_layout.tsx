import { ThemeProvider } from "./context/ThemeContext";
import { Tabs } from "expo-router";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: "#14161c" },
          headerTintColor: "#ffffff",
          tabBarStyle: { backgroundColor: "#14161c" },
          tabBarActiveTintColor: "#60a5fa",
          tabBarInactiveTintColor: "#9ca3af",
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    </ThemeProvider>
  );
}
