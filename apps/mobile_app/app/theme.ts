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
  primary: "#262626",
  onPrimary: "#ffffff",
  primaryContainer: "#e5e5e5",
  onPrimaryContainer: "#171717",
  secondary: "#525252",
  onSecondary: "#ffffff",
  background: "#f5f5f5",
  onBackground: "#171717",
  surface: "#ffffff",
  onSurface: "#171717",
  surfaceVariant: "#fafafa",
  onSurfaceVariant: "#525252",
  outline: "#e5e5e5",
  outlineVariant: "#d4d4d4",
  error: "#b91c1c",
  onError: "#ffffff",
  elevation: {
    ...MD3LightTheme.colors.elevation,
    level0: "#f5f5f5",
    level1: "#ffffff",
    level2: "#ffffff",
    level3: "#ffffff",
    level4: "#ffffff",
    level5: "#ffffff",
  },
  // Custom tokens
  success: "#166534",
  danger: "#b91c1c",
  info: "#171717",
  infoBg: "#f5f5f5",
  infoBorder: "#d4d4d4",
  infoText: "#171717",
  muted: "#525252",
  warning: "#b45309",
  warningBg: "#fef3c7",
  warningBorder: "#fcd34d",
  warningText: "#92400e",
};

const darkColors = {
  ...MD3DarkTheme.colors,
  primary: "#e5e5e5",
  onPrimary: "#171717",
  primaryContainer: "#404040",
  onPrimaryContainer: "#fafafa",
  secondary: "#a3a3a3",
  onSecondary: "#171717",
  background: "#121212",
  onBackground: "#fafafa",
  surface: "#1e1e1e",
  onSurface: "#fafafa",
  surfaceVariant: "#262626",
  onSurfaceVariant: "#a3a3a3",
  outline: "#404040",
  outlineVariant: "#525252",
  error: "#f87171",
  onError: "#171717",
  elevation: {
    ...MD3DarkTheme.colors.elevation,
    level0: "#121212",
    level1: "#1e1e1e",
    level2: "#262626",
    level3: "#2e2e2e",
    level4: "#404040",
    level5: "#525252",
  },
  // Custom tokens
  success: "#4ade80",
  danger: "#f87171",
  info: "#fafafa",
  infoBg: "#262626",
  infoBorder: "#404040",
  infoText: "#fafafa",
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
