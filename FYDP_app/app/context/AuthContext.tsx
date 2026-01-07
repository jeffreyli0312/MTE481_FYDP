
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import * as Linking from "expo-linking";

type AuthContextType = {
    user: any | null;
    loading: boolean;
    signUp: (email: string, password: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                console.log("Auth: calling getSession()");
                const { data, error } = await supabase.auth.getSession();
                console.log("Auth: getSession() returned", { hasSession: !!data.session, error });

                if (!mounted) return;

                if (error) console.log("Auth: getSession error", error);
                setUser(data.session?.user ?? null);
            } catch (e) {
                console.log("Auth: getSession threw", e);
            } finally {
                if (mounted) setLoading(false);
                console.log("Auth: loading=false");
            }
        })();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log("Auth: state change", _event, !!session);
            setUser(session?.user ?? null);
        });

        return () => {
            mounted = false;
            listener.subscription.unsubscribe();
        };
    }, []);


    async function signUp(email: string, password: string) {
        const redirectTo = Linking.createURL("login"); // -> fydpapp://login (in production)
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: redirectTo,
            },
        });
        if (error) throw error;
    }

    async function signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }

    const value = useMemo(() => ({ user, loading, signUp, signIn, signOut }), [user, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
}
