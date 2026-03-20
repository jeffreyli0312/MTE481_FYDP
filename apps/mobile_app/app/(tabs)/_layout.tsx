import { Tabs } from "expo-router";
import { useAppTheme } from "../theme";
import { useDevMode } from "../context/DevModeContext";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const { devMode } = useDevMode();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.outline,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="homepage"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="bletest" options={{ href: null }} />
      <Tabs.Screen
        name="sqlite_test"
        options={devMode ? {
          title: "Database",
          tabBarIcon: ({ color, size }) => <Ionicons name="server" size={size} color={color} />,
        } : { href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
