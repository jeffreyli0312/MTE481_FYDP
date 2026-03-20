# Components

## SessionView (`app/components/SessionView.tsx`)

The active workout session screen. Rendered inside `homepage.tsx` when the user starts a new session for an exercise.

**Props:**
- `exerciseName` — name of the exercise (e.g. "Bench Press")
- `onBack` — callback when the user taps Back (returns to exercise overview)
- `onEndSession(session)` — callback with the completed `SessionRecord` when the session ends

**Internal state (self-contained):**
- Session timer (counts up from 0)
- Set recording state (isRecording, set timer, live force reading)
- Completed sets list
- BLE connection (via `useBle` hook)

**Sections:**
1. **Header** — Back button + session elapsed time
2. **Device Connection card** — scan for EVA devices, connect/disconnect. Shows a warning if not connected. Contains a sub-component `DeviceConnectionCard`.
3. **Recording card** — "Start Recording" button or active recording display (timer, live force, "End Recording")
4. **Completed Sets** — list of finished sets with duration and force
5. **End Session** — disabled until at least one set is completed

**Recording guard:** `Start Recording` is disabled until `ble.connectedDevice` is set; `startRecording()` also shows an alert if called without a connection.

---

## ExerciseOverview (`app/components/ExerciseOverview.tsx`)

The exercise detail page showing session history and a button to start a new session. Rendered inside `homepage.tsx` when the user selects an exercise.

**Props:**
- `exerciseName` — exercise display name
- `sessions` — array of `SessionRecord` for this exercise
- `onBack` — callback to return to home screen
- `onStartNewSession` — callback to enter the active session view

**Sections:**
1. **Header** — Back to Home link, exercise name, session count
2. **Start New Session** — button to begin a workout
3. **Previous Sessions** — list of past sessions with date, duration, sets count, and average force. Shows an info card if no sessions exist yet.

---

## DeviceConnectionCard (inside `SessionView.tsx`)

A private sub-component within `SessionView.tsx` that handles the BLE device connection UI.

**Props:**
- `ble` — the return value of `useBle()` hook

**Behavior:**
- **Connected state:** Shows device name + Disconnect button
- **Disconnected state:** Shows warning message, Scan button, and list of discovered devices. Tapping a device connects to it.
