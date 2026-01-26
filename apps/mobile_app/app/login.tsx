import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useAuth } from "./context/AuthContext";
import { Redirect } from "expo-router";

export default function Login() {
    const { user, loading, signIn, signUp } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // If already logged in, go to the tabs group
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
        <View style={{ flex: 1, backgroundColor: "#14161c", padding: 16, paddingTop: 70 }}>
            <Text style={{ color: "white", fontSize: 26, fontWeight: "700" }}>
                {mode === "signin" ? "Sign in" : "Create account"}
            </Text>

            <Text style={{ color: "#9ca3af", marginTop: 18 }}>Email</Text>
            <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor="#6b7280"
                style={{
                    marginTop: 6,
                    backgroundColor: "#1e2128",
                    color: "white",
                    padding: 12,
                    borderRadius: 12,
                }}
            />

            <Text style={{ color: "#9ca3af", marginTop: 14 }}>Password</Text>
            <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#6b7280"
                style={{
                    marginTop: 6,
                    backgroundColor: "#1e2128",
                    color: "white",
                    padding: 12,
                    borderRadius: 12,
                }}
            />

            {err ? (
                <Text style={{ color: "#f87171", marginTop: 12 }}>{err}</Text>
            ) : null}

            <Pressable
                onPress={onSubmit}
                disabled={submitting}
                style={{
                    marginTop: 18,
                    backgroundColor: submitting ? "#1d4ed8" : "#2563eb",
                    padding: 12,
                    borderRadius: 12,
                    alignItems: "center",
                    opacity: submitting ? 0.8 : 1,
                }}
            >
                {submitting ? (
                    <ActivityIndicator />
                ) : (
                    <Text style={{ color: "white", fontWeight: "600" }}>
                        {mode === "signin" ? "Sign in" : "Sign up"}
                    </Text>
                )}
            </Pressable>

            <Pressable
                onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
                style={{ marginTop: 14, alignItems: "center" }}
            >
                <Text style={{ color: "#60a5fa" }}>
                    {mode === "signin"
                        ? "New here? Create an account"
                        : "Already have an account? Sign in"}
                </Text>
            </Pressable>

            {loading ? (
                <View style={{ marginTop: 16 }}>
                    <Text style={{ color: "#9ca3af" }}>Checking session...</Text>
                </View>
            ) : null}
        </View>
    );
}
