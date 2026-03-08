import React, { createContext, useContext, useMemo } from "react";

// Hardcoded local user — no Supabase dependency.
// To restore authentication, revert this file to the Supabase-backed version.
const LOCAL_USER = {
  id: "local-user",
  email: "local@eva.dev",
};

type AuthContextType = {
  user: typeof LOCAL_USER | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<AuthContextType>(
    () => ({
      user: LOCAL_USER,
      loading: false,
      signUp: async () => {},
      signIn: async () => {},
      signOut: async () => {},
    }),
    [],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
