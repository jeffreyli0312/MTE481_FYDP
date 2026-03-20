import {
  MD3DarkTheme,
  MD3LightTheme,
  configureFonts,
  useTheme as usePaperTheme,
} from "react-native-paper";

// Professional tech palette – refined indigo/slate
const accent = "#6366f1";
const accentLight = "#818cf8";
const accentMuted = "#4f46e5";

const interFontConfig = {
  fontFamily: "Inter_400Regular",
  // Override title/label variants for clearer hierarchy
  titleSmall: { fontFamily: "Inter_500Medium" },
  titleMedium: { fontFamily: "Inter_500Medium" },
  titleLarge: { fontFamily: "Inter_500Medium" },
  labelSmall: { fontFamily: "Inter_500Medium" },
  labelMedium: { fontFamily: "Inter_500Medium" },
  labelLarge: { fontFamily: "Inter_500Medium" },
  headlineSmall: { fontFamily: "Inter_600SemiBold" },
  headlineMedium: { fontFamily: "Inter_600SemiBold" },
  headlineLarge: { fontFamily: "Inter_600SemiBold" },
  displaySmall: { fontFamily: "Inter_600SemiBold" },
  displayMedium: { fontFamily: "Inter_600SemiBold" },
  displayLarge: { fontFamily: "Inter_600SemiBold" },
};

const lightColors = {
  ...MD3LightTheme.colors,
  primary: accent,
  onPrimary: "#ffffff",
  primaryContainer: "#eef2ff",
  onPrimaryContainer: "#312e81",
  secondary: accentMuted,
  onSecondary: "#ffffff",
  background: "#f8fafc",
  onBackground: "#0f172a",
  surface: "#ffffff",
  onSurface: "#0f172a",
  surfaceVariant: "#f1f5f9",
  onSurfaceVariant: "#475569",
  outline: "#e2e8f0",
  outlineVariant: "#cbd5e1",
  error: "#d32f2f",
  onError: "#ffffff",
  elevation: {
    ...MD3LightTheme.colors.elevation,
    level0: "#f8fafc",
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
  infoBg: "#eef2ff",
  infoBorder: "#c7d2fe",
  infoText: "#312e81",
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
  primaryContainer: "#312e81",
  onPrimaryContainer: "#c7d2fe",
  secondary: accentLight,
  onSecondary: "#1a1a1a",
  background: "#0f172a",
  onBackground: "#f8fafc",
  surface: "#1e293b",
  onSurface: "#f8fafc",
  surfaceVariant: "#334155",
  onSurfaceVariant: "#cbd5e1",
  outline: "#475569",
  outlineVariant: "#64748b",
  error: "#ef5350",
  onError: "#ffffff",
  elevation: {
    ...MD3DarkTheme.colors.elevation,
    level0: "#0f172a",
    level1: "#1e293b",
    level2: "#22202c",
    level3: "#282634",
    level4: "#2e2c3c",
    level5: "#343244",
  },
  // Custom tokens
  success: "#66bb6a",
  danger: "#ef5350",
  info: accentLight,
  infoBg: "#1e1b4b",
  infoBorder: "#4338ca",
  infoText: "#c7d2fe",
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
  fonts: configureFonts({ config: interFontConfig }),
  roundness: 12,
};

export const DarkTheme = {
  ...MD3DarkTheme,
  colors: darkColors,
  fonts: configureFonts({ config: interFontConfig }),
  roundness: 12,
};

export type AppTheme = typeof LightTheme;

export function useAppTheme() {
  return usePaperTheme<AppTheme>();
}
