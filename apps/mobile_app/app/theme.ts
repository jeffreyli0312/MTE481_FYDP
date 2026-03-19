import {
  MD3DarkTheme,
  MD3LightTheme,
  useTheme as usePaperTheme,
} from "react-native-paper";

const accent = "#BC9EEE";

const lightColors = {
  ...MD3LightTheme.colors,
  primary: accent,
  onPrimary: "#ffffff",
  primaryContainer: "#f3ecfc",
  onPrimaryContainer: "#4a3a5c",
  secondary: accent,
  onSecondary: "#ffffff",
  background: "#ffffff",
  onBackground: "#1a1a1a",
  surface: "#ffffff",
  onSurface: "#1a1a1a",
  surfaceVariant: "#fafafa",
  onSurfaceVariant: "#6b6b6b",
  outline: "#eeeeee",
  outlineVariant: "#e8e8e8",
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
  info: accent,
  infoBg: "#f3ecfc",
  infoBorder: "#e2d4f0",
  infoText: "#4a3a5c",
  muted: "#6b6b6b",
  warning: "#f59e0b",
  warningBg: "#fffbeb",
  warningBorder: "#fde68a",
  warningText: "#92400e",
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: accent,
  onPrimary: "#ffffff",
  primaryContainer: "#3d2d4f",
  onPrimaryContainer: "#e2d4f0",
  secondary: accent,
  onSecondary: "#ffffff",
  background: "#0f0f0f",
  onBackground: "#ffffff",
  surface: "#1a1a1a",
  onSurface: "#ffffff",
  surfaceVariant: "#1e1e1e",
  onSurfaceVariant: "#a0a0a0",
  outline: "#2e2e2e",
  outlineVariant: "#383838",
  error: "#ef4444",
  onError: "#ffffff",
  elevation: {
    ...MD3DarkTheme.colors.elevation,
    level0: "#0f0f0f",
    level1: "#1a1a1a",
    level2: "#1a1a1a",
    level3: "#1a1a1a",
    level4: "#1a1a1a",
    level5: "#1a1a1a",
  },
  // Custom tokens
  success: "#22c55e",
  danger: "#fb7185",
  info: accent,
  infoBg: "#1f1528",
  infoBorder: "#2d2040",
  infoText: "#e2d4f0",
  muted: "#a0a0a0",
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
