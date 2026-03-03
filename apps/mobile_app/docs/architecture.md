# Mobile App Architecture

## Overview

The EVA mobile app is built with **React Native** + **Expo Router** (file-based routing) and uses **React Native Paper** (Material Design 3) for UI components. The backend is **Supabase** (auth + Postgres). BLE communication is handled via **react-native-ble-plx**.

## Directory Structure

```
app/
├── _layout.tsx              # Root layout (AuthProvider → ThemeProvider → PaperProvider → Stack)
├── login.tsx                # Login / sign-up screen
├── theme.ts                 # MD3 light/dark theme definitions + useAppTheme hook
│
├── (tabs)/                  # Tab navigator (authenticated area)
│   ├── _layout.tsx          # Tab bar config + auth guard
│   ├── index.tsx            # Redirect → /homepage
│   ├── homepage.tsx         # Home screen + exercise selection + orchestrates session flow
│   ├── history.tsx          # Past sessions list (from Supabase)
│   ├── bletest.tsx          # Standalone BLE scanner/monitor (dev tool)
│   └── settings.tsx         # Dark mode toggle + logout
│
├── session/
│   └── [sessionId].tsx      # Session detail → lists sets (from Supabase)
│
├── set/
│   └── [setId].tsx          # Set analytics (charts, stats) (from Supabase)
│
├── components/
│   ├── SessionView.tsx      # Active workout session UI (recording, BLE, completed sets)
│   └── ExerciseOverview.tsx  # Exercise detail with previous sessions list
│
├── hooks/
│   └── useBle.ts            # Reusable BLE hook (scan, connect, disconnect)
│
├── context/
│   ├── AuthContext.tsx       # Supabase auth state + signIn/signUp/signOut
│   └── ThemeContext.tsx      # Light/dark theme toggle
│
├── types/
│   └── workout.ts           # Shared types (Exercise, SetRecord, SessionRecord)
│
└── utils/
    └── format.ts            # Shared formatters (formatMMSS, formatMinSec, formatDateShort)

lib/
└── supabase.ts              # Supabase client instance
```

## Data Flow

```
User opens app
  → _layout.tsx checks auth (AuthProvider)
  → Not logged in → login.tsx
  → Logged in → (tabs)/_layout.tsx → homepage

Homepage → select exercise → ExerciseOverview → start session → SessionView
                                                                    ↓
                                                              useBle hook (scan/connect ESP32)
                                                              Record sets → end session
                                                                    ↓
                                                              SessionRecord saved to local state
                                                              (Supabase persistence TBD)

History tab → sessions from Supabase → session/[sessionId] → set/[setId] (charts)
```
