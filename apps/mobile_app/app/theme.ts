import {
  MD3DarkTheme,
  MD3LightTheme,
  useTheme as usePaperTheme,
} from "react-native-paper";

const accent = "#BC9EEE";
const accentLight = "#d4c4ec";
const accentMuted = "#9a7bc4";

const lightColors = {
  ...MD3LightTheme.colors,
  primary: accent,
  onPrimary: "#ffffff",
  primaryContainer: "#f3ecfc",
  onPrimaryContainer: "#4a3a5c",
  secondary: accentMuted,
  onSecondary: "#ffffff",
  background: "#f8f6fc",
  onBackground: "#1a1a1a",
  surface: "#ffffff",
  onSurface: "#1a1a1a",
  surfaceVariant: "#f5f0fa",
  onSurfaceVariant: "#4a4a4a",
  outline: "#d4c8e0",
  outlineVariant: "#e2d8ec",
  error: "#d32f2f",
  onError: "#ffffff",
  elevation: {
    ...MD3LightTheme.colors.elevation,
    level0: "#f8f6fc",
    level1: "#ffffff",
    level2: "#ffffff",
    level3: "#ffffff",
    level4: "#ffffff",
    level5: "#ffffff",
  },
  // Custom tokens
  success: "#2e7d32",
  danger: "#c62828",
  info: accent,
  infoBg: "#f3ecfc",
  infoBorder: "#d4c4ec",
  infoText: "#4a3a5c",
  muted: "#5a5a5a",
  warning: "#ed6c02",
  warningBg: "#fff3e0",
  warningBorder: "#ffcc80",
  warningText: "#e65100",
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: accent,
  onPrimary: "#ffffff",
  primaryContainer: "#3d2d4f",
  onPrimaryContainer: "#e2d4f0",
  secondary: accentLight,
  onSecondary: "#1a1a1a",
  background: "#12101a",
  onBackground: "#ffffff",
  surface: "#1c1a24",
  onSurface: "#ffffff",
  surfaceVariant: "#252330",
  onSurfaceVariant: "#c8c4d0",
  outline: "#3d3848",
  outlineVariant: "#4a4558",
  error: "#ef5350",
  onError: "#ffffff",
  elevation: {
    ...MD3DarkTheme.colors.elevation,
    level0: "#12101a",
    level1: "#1c1a24",
    level2: "#22202c",
    level3: "#282634",
    level4: "#2e2c3c",
    level5: "#343244",
  },
  // Custom tokens
  success: "#66bb6a",
  danger: "#ef5350",
  info: accentLight,
  infoBg: "#1f1528",
  infoBorder: "#3d2d4f",
  infoText: "#e2d4f0",
  muted: "#b0aab8",
  warning: "#ffb74d",
  warningBg: "#2d2419",
  warningBorder: "#4a3d28",
  warningText: "#ffe0b2",
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
