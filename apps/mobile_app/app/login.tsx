import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text, TextInput, Button, ActivityIndicator } from "react-native-paper";
import { useAuth } from "./context/AuthContext";
import { Redirect } from "expo-router";
import { useAppTheme } from "./theme";

export default function Login() {
  const { user, loading, signIn, signUp } = useAuth();
  const { colors } = useAppTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!loading && user) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSubmit() {
    setErr(null);
    setSubmitting(true);
    try {
      const e = email.trim();
      if (!e || !password) {
        setErr("Please enter email and password.");
        return;
      }

      if (mode === "signup") {
        await signUp(e, password);
        setMode("signin");
        setErr("Check your email to confirm your account, then sign in.");
      } else {
        await signIn(e, password);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text variant="headlineMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
        {mode === "signin" ? "Sign in" : "Create account"}
      </Text>

      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        mode="outlined"
        style={styles.input}
        outlineColor={colors.outline}
        activeOutlineColor={colors.primary}
        textColor={colors.onSurface}
      />

      <TextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        mode="outlined"
        style={styles.input}
        outlineColor={colors.outline}
        activeOutlineColor={colors.primary}
        textColor={colors.onSurface}
      />

      {err ? (
        <Text variant="bodySmall" style={{ color: colors.error, marginTop: 12 }}>
          {err}
        </Text>
      ) : null}

      <Button
        mode="contained"
        onPress={onSubmit}
        disabled={submitting}
        loading={submitting}
        style={styles.submitBtn}
        buttonColor={colors.primary}
        textColor={colors.onPrimary}
      >
        {mode === "signin" ? "Sign in" : "Sign up"}
      </Button>

      <Button
        mode="text"
        onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
        style={{ marginTop: 8 }}
        textColor={colors.primary}
      >
        {mode === "signin"
          ? "New here? Create an account"
          : "Already have an account? Sign in"}
      </Button>

      {loading ? (
        <View style={{ marginTop: 16, alignItems: "center" }}>
          <ActivityIndicator size="small" />
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginTop: 6 }}>
            Checking session...
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 70,
  },
  input: {
    marginTop: 14,
  },
  submitBtn: {
    marginTop: 18,
    borderRadius: 12,
  },
});
