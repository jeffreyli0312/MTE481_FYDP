import { Tabs, Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../theme";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { colors } = useAppTheme();

  if (loading) return null;

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        tabBarStyle: { backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
      }}
    >
      <Tabs.Screen name="homepage" options={{ title: "Home Page" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="bletest" options={{ title: "BLE" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      {/* <Tabs.Screen name="showDbTest" options={{ title: "Test" }} /> */}

      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
