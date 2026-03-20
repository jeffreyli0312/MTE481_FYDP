import {
  MD3DarkTheme,
  MD3LightTheme,
  configureFonts,
  useTheme as usePaperTheme,
} from "react-native-paper";

// Black & white primary palette
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
  primary: "#000000",
  onPrimary: "#ffffff",
  primaryContainer: "#e5e5e5",
  onPrimaryContainer: "#000000",
  secondary: "#404040",
  onSecondary: "#ffffff",
  background: "#ffffff",
  onBackground: "#000000",
  surface: "#ffffff",
  onSurface: "#000000",
  surfaceVariant: "#f5f5f5",
  onSurfaceVariant: "#525252",
  outline: "#e5e5e5",
  outlineVariant: "#d4d4d4",
  error: "#b91c1c",
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
  success: "#166534",
  danger: "#b91c1c",
  info: "#000000",
  infoBg: "#f5f5f5",
  infoBorder: "#d4d4d4",
  infoText: "#000000",
  muted: "#525252",
  warning: "#b45309",
  warningBg: "#fef3c7",
  warningBorder: "#fcd34d",
  warningText: "#92400e",
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: "#ffffff",
  onPrimary: "#000000",
  primaryContainer: "#404040",
  onPrimaryContainer: "#ffffff",
  secondary: "#a3a3a3",
  onSecondary: "#000000",
  background: "#000000",
  onBackground: "#ffffff",
  surface: "#0a0a0a",
  onSurface: "#ffffff",
  surfaceVariant: "#171717",
  onSurfaceVariant: "#a3a3a3",
  outline: "#262626",
  outlineVariant: "#404040",
  error: "#f87171",
  onError: "#000000",
  elevation: {
    ...MD3DarkTheme.colors.elevation,
    level0: "#000000",
    level1: "#0a0a0a",
    level2: "#171717",
    level3: "#262626",
    level4: "#404040",
    level5: "#525252",
  },
  // Custom tokens
  success: "#4ade80",
  danger: "#f87171",
  info: "#ffffff",
  infoBg: "#171717",
  infoBorder: "#404040",
  infoText: "#ffffff",
  muted: "#a3a3a3",
  warning: "#fbbf24",
  warningBg: "#422006",
  warningBorder: "#78350f",
  warningText: "#fef3c7",
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
