import {
  MD3DarkTheme,
  MD3LightTheme,
  useTheme as usePaperTheme,
} from "react-native-paper";

const lightColors = {
  ...MD3LightTheme.colors,
  primary: "#2563eb",
  onPrimary: "#ffffff",
  primaryContainer: "#dbeafe",
  onPrimaryContainer: "#1e3a8a",
  secondary: "#6b7280",
  onSecondary: "#ffffff",
  background: "#f5f5f5",
  onBackground: "#111827",
  surface: "#ffffff",
  onSurface: "#111827",
  surfaceVariant: "#f5f7fb",
  onSurfaceVariant: "#6b7280",
  outline: "#e5e7eb",
  outlineVariant: "#e5e7eb",
  error: "#ef4444",
  onError: "#ffffff",
  elevation: {
    ...MD3LightTheme.colors.elevation,
    level0: "#ffffff",
    level1: "#ffffff",
    level2: "#ffffff",
    level3: "#ffffff",
    level4: "#ffffff",
    level5: "#ffffff",
  },
  // Custom tokens
  success: "#22c55e",
  danger: "#e11d48",
  info: "#2563eb",
  infoBg: "#eff6ff",
  infoBorder: "#bfdbfe",
  infoText: "#1e3a8a",
  muted: "#6b7280",
  warning: "#f59e0b",
  warningBg: "#fffbeb",
  warningBorder: "#fde68a",
  warningText: "#92400e",
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: "#60a5fa",
  onPrimary: "#ffffff",
  primaryContainer: "#1e3a8a",
  onPrimaryContainer: "#dbeafe",
  secondary: "#9ca3af",
  onSecondary: "#ffffff",
  background: "#14161c",
  onBackground: "#ffffff",
  surface: "#1e2128",
  onSurface: "#ffffff",
  surfaceVariant: "#1e2128",
  onSurfaceVariant: "#9ca3af",
  outline: "#2b2f3a",
  outlineVariant: "#2b2f3a",
  error: "#ef4444",
  onError: "#ffffff",
  elevation: {
    ...MD3DarkTheme.colors.elevation,
    level0: "#14161c",
    level1: "#1e2128",
    level2: "#1e2128",
    level3: "#1e2128",
    level4: "#1e2128",
    level5: "#1e2128",
  },
  // Custom tokens
  success: "#22c55e",
  danger: "#fb7185",
  info: "#60a5fa",
  infoBg: "#0f172a",
  infoBorder: "#1f2937",
  infoText: "#cbd5e1",
  muted: "#9ca3af",
  warning: "#fbbf24",
  warningBg: "#1c1917",
  warningBorder: "#44403c",
  warningText: "#fde68a",
};

export type AppThemeColors = typeof lightColors;

export const LightTheme = {
  ...MD3LightTheme,
  colors: lightColors,
};

export const DarkTheme = {
  ...MD3DarkTheme,
  colors: darkColors,
};

export type AppTheme = typeof LightTheme;

export function useAppTheme() {
  return usePaperTheme<AppTheme>();
}
