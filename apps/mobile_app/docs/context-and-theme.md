# Context Providers & Theme

## App Wrapper Order (`app/_layout.tsx`)

The root layout wraps the entire app in this order:

```
AuthProvider          ← Supabase auth state
  └── ThemeProvider   ← light/dark toggle
        └── PaperProvider  ← React Native Paper MD3 theme
              └── Stack    ← Expo Router navigation stack
```

`InnerLayout` reads the current theme from `ThemeContext` and passes the corresponding Paper theme (`LightTheme` or `DarkTheme`) to `PaperProvider`.

---

## AuthContext (`app/context/AuthContext.tsx`)

Manages Supabase authentication state.

**Provided values:**
| Field | Type | Description |
|-------|------|-------------|
| `user` | `any \| null` | Current Supabase user object, or null if logged out |
| `loading` | `boolean` | True while initial session check is in progress |
| `signUp(email, password)` | `async` | Creates a new account with email redirect |
| `signIn(email, password)` | `async` | Signs in with email + password |
| `signOut()` | `async` | Signs the user out |

**Behavior:**
- On mount, calls `supabase.auth.getSession()` to restore the session
- Subscribes to `onAuthStateChange` for real-time auth updates (e.g. token refresh, sign out from another tab)
- Debug logs are included for troubleshooting auth flow

---

## ThemeContext (`app/context/ThemeContext.tsx`)

Manages the light/dark mode preference.

**Provided values:**
| Field | Type | Description |
|-------|------|-------------|
| `theme` | `"light" \| "dark"` | Current theme mode (defaults to `"dark"`) |
| `toggleTheme()` | `function` | Switches between light and dark |

---

## Theme (`app/theme.ts`)

Defines the Material Design 3 color tokens for React Native Paper.

**Custom color tokens** (beyond standard MD3):
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `success` | `#22c55e` | `#22c55e` | Connected status, positive actions |
| `danger` | `#e11d48` | `#fb7185` | Recording badge, destructive actions |
| `info` / `infoBg` / `infoBorder` / `infoText` | blue tones | slate tones | Info cards, force reading backgrounds |
| `warning` / `warningBg` / `warningBorder` / `warningText` | amber tones | amber tones | EVA connection warning |
| `muted` | `#6b7280` | `#9ca3af` | Secondary text |

**Exports:**
- `LightTheme` / `DarkTheme` — full Paper theme objects
- `useAppTheme()` — typed hook that returns `{ colors, dark, ... }` from the nearest `PaperProvider`
- `AppTheme` / `AppThemeColors` — TypeScript types for the theme
