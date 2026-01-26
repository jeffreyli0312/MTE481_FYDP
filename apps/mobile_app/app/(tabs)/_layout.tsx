
import { Tabs, Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";

export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Redirect href="/login" />;

  return (
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
  );
}
