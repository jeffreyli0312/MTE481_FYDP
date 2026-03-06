# Screens

## Homepage (`app/(tabs)/homepage.tsx`)

The main entry point after login. Acts as an orchestrator that switches between three views based on state:

1. **Home** (`screenMode === "home"`) — shows welcome card, available exercises list, and stats (total sessions/sets). Tapping an exercise navigates to the exercise overview.
2. **Exercise Overview** (`screenMode === "exercise"`, `exerciseMode === "overview"`) — renders `<ExerciseOverview />`. Shows past sessions and a "Start New Session" button.
3. **Active Session** (`screenMode === "exercise"`, `exerciseMode === "session"`) — renders `<SessionView />`. Full workout flow with BLE connection, recording, and set tracking.

**State managed here:**
- `screenMode` / `exerciseMode` — which view to show
- `selectedExercise` — currently selected exercise
- `sessionsByExercise` — record of all completed sessions, keyed by exercise ID

When `SessionView` calls `onEndSession(session)`, the session is added to `sessionsByExercise` and the view returns to the exercise overview.

---

## Login (`app/login.tsx`)

Sign-in / sign-up screen. Uses Supabase email+password auth.

- Toggle between "Sign in" and "Create account" modes
- Email and password fields (React Native Paper `TextInput`)
- Shows loading indicator during submission
- Redirects to `/(tabs)` once authenticated (via `useAuth().user`)
- Error messages displayed inline

---

## History (`app/(tabs)/history.tsx`)

Displays all past sessions from the Supabase `sessions` table.

- Loads sessions on mount, ordered by `created_at` descending
- Each session card shows date, duration, and label
- Tapping a session navigates to `session/[sessionId]` to see its sets
- Contains an unused `MetricCard` component (for inline charts, from an older version)

---

## Session Detail (`app/session/[sessionId].tsx`)

Shows all sets within a specific session. Accessed by tapping a session in the History tab.

- Fetches sets from the `sets` table filtered by `session_id`
- Calculates duration for each set from `imu_samples` min/max times
- Each set card shows date, duration, and label
- Tapping a set navigates to `set/[setId]` for detailed analytics
- Back button returns to History

---

## Set Analytics (`app/set/[setId].tsx`)

Detailed analytics for a single set. Shows charts and stats.

- Fetches EMG and IMU samples from Supabase for the given set
- **Charts:** EMG/force line chart, yaw rate line chart, per-rep force bar chart
- **Stats:** duration, total samples, average force, max force, rep count
- **Insights:** auto-generated text insights (fatigue detection, force consistency)
- Toggle between "force" and "yaw" metric views
- Back button returns to Session Detail

---

## BLE Test (`app/(tabs)/bletest.tsx`)

A standalone BLE scanner and data monitor. Primarily a developer/debug tool.

- Shows Bluetooth adapter status (on/off)
- Scan button to discover nearby BLE devices (10-second timeout)
- Device list with name, ID, RSSI — tap to connect
- Connected device card with Disconnect button
- **Live Data panel:** shows raw byte arrays from all notifiable characteristics in real-time, auto-scrolling log (max 200 entries)
- Includes `decodeBase64ToBytes` for converting BLE characteristic values
- Logs data to Metro console via `console.log("BLE data:", bytes)`

---

## Settings (`app/(tabs)/settings.tsx`)

Simple settings screen with two controls:

- **Dark mode toggle** — switches between light/dark theme via `ThemeContext`
- **Log out button** — calls `signOut()` from `AuthContext`
