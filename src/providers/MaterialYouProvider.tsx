import React, { createContext, useContext, useMemo, useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { log } from "@/lib/logger";

// ============================================
// MATERIAL YOU DYNAMIC THEME ENGINE
// Based on Material 3 / Material You principles
// With Neurotype-Based Dynamic Theming (Neuro-Sync)
// ============================================

// ============================================
// NEUROTYPE COLOR MAPPING
// ============================================

export type Neurotype = "1A" | "1B" | "2A" | "2B" | "3";

const NEUROTYPE_COLORS: Record<Neurotype, { hex: string; label: string; description: string }> = {
  "1A": { hex: "#D32F2F", label: "Intenso", description: "Intensity & Competitiveness" },
  "1B": { hex: "#0097A7", label: "Preciso", description: "Speed & Precision" },
  "2A": { hex: "#7B1FA2", label: "Adattabile", description: "Variety & Adaptability" },
  "2B": { hex: "#388E3C", label: "Connesso", description: "Sensation & Connection" },
  "3": { hex: "#F57C00", label: "Stabile", description: "Routine & Stability" },
};

const MANUAL_COLOR_OPTIONS = [
  { hex: "#6366f1", label: "Indigo" },
  { hex: "#D32F2F", label: "Red" },
  { hex: "#0097A7", label: "Cyan" },
  { hex: "#7B1FA2", label: "Violet" },
  { hex: "#388E3C", label: "Green" },
  { hex: "#F57C00", label: "Amber" },
];

// ============================================
// TYPES
// ============================================

interface ColorTones {
  0: string;
  10: string;
  20: string;
  30: string;
  40: string;
  50: string;
  60: string;
  70: string;
  80: string;
  90: string;
  95: string;
  99: string;
  100: string;
}

interface MaterialPalette {
  primary: ColorTones;
  secondary: ColorTones;
  tertiary: ColorTones;
  neutral: ColorTones;
  neutralVariant: ColorTones;
  error: ColorTones;
}

interface SurfaceColors {
  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
}

interface MaterialTheme {
  isDark: boolean;
  seedColor: string;
  palette: MaterialPalette;
  surfaces: SurfaceColors;
  // Semantic color tokens
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  // Elevation overlays
  elevation: {
    level0: string;
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    level5: string;
  };
}

interface ThemePreferences {
  isNeuroSyncEnabled: boolean;
  manualColor: string | null;
}

interface MaterialYouContextValue {
  theme: MaterialTheme;
  setSeedColor: (color: string) => void;
  // Neuro-Sync features
  isNeuroSyncEnabled: boolean;
  setNeuroSyncEnabled: (enabled: boolean) => void;
  manualColor: string | null;
  setManualColor: (color: string | null) => void;
  userNeurotype: Neurotype | null;
  neurotypeSeedColor: string | null;
}

const MaterialYouContext = createContext<MaterialYouContextValue | null>(null);

// ============================================
// LOCAL STORAGE KEYS
// ============================================

const STORAGE_KEY_PREFERENCES = "material-you-preferences";

function loadPreferences(): ThemePreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREFERENCES);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    log.warn("Failed to load theme preferences:", e);
  }
  return { isNeuroSyncEnabled: true, manualColor: null };
}

function savePreferences(prefs: ThemePreferences) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(prefs));
  } catch (e) {
    log.warn("Failed to save theme preferences:", e);
  }
}

// ============================================
// COLOR SCIENCE UTILITIES
// ============================================

// Convert HEX to HSL
function hexToHsl(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 50];

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

// Generate tonal palette from base hue/saturation
function generateTonalPalette(hue: number, chroma: number): ColorTones {
  const tones = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100] as const;
  const palette: Partial<ColorTones> = {};

  tones.forEach((tone) => {
    // Adjust chroma based on tone (less saturated at extremes)
    const adjustedChroma =
      tone === 0 || tone === 100 ? 0 : chroma * (1 - Math.abs(tone - 50) / 100);

    palette[tone] = `${hue} ${Math.round(adjustedChroma)}% ${tone}%`;
  });

  return palette as ColorTones;
}

// Generate full Material palette from seed color
function generateMaterialPalette(seedHex: string): MaterialPalette {
  const [hue, saturation] = hexToHsl(seedHex);

  // Primary: Keep the seed color's hue
  const primary = generateTonalPalette(hue, saturation);

  // Secondary: Shift hue by 60°, reduce saturation
  const secondary = generateTonalPalette((hue + 60) % 360, saturation * 0.3);

  // Tertiary: Shift hue by 120°
  const tertiary = generateTonalPalette((hue + 120) % 360, saturation * 0.6);

  // Neutral: Very low saturation, base hue
  const neutral = generateTonalPalette(hue, 4);

  // Neutral variant: Slight saturation for surfaces
  const neutralVariant = generateTonalPalette(hue, 8);

  // Error: Red with consistent tones
  const error = generateTonalPalette(0, 75);

  return { primary, secondary, tertiary, neutral, neutralVariant, error };
}

// Generate surface colors with proper elevation
function generateSurfaces(neutral: ColorTones, isDark: boolean): SurfaceColors {
  if (isDark) {
    return {
      surface: neutral[10],
      surfaceDim: neutral[10],
      surfaceBright: neutral[30],
      surfaceContainerLowest: neutral[0],
      surfaceContainerLow: neutral[10],
      surfaceContainer: neutral[20],
      surfaceContainerHigh: neutral[20],
      surfaceContainerHighest: neutral[30],
    };
  }

  return {
    surface: neutral[99],
    surfaceDim: neutral[90],
    surfaceBright: neutral[99],
    surfaceContainerLowest: neutral[100],
    surfaceContainerLow: neutral[95],
    surfaceContainer: neutral[95],
    surfaceContainerHigh: neutral[90],
    surfaceContainerHighest: neutral[90],
  };
}

// Generate full theme from seed color
function generateTheme(seedColor: string, isDark: boolean): MaterialTheme {
  const palette = generateMaterialPalette(seedColor);
  const surfaces = generateSurfaces(palette.neutral, isDark);

  if (isDark) {
    return {
      isDark,
      seedColor,
      palette,
      surfaces,
      // Core colors (dark scheme)
      primary: palette.primary[80],
      onPrimary: palette.primary[20],
      primaryContainer: palette.primary[30],
      onPrimaryContainer: palette.primary[90],
      secondary: palette.secondary[80],
      onSecondary: palette.secondary[20],
      secondaryContainer: palette.secondary[30],
      onSecondaryContainer: palette.secondary[90],
      tertiary: palette.tertiary[80],
      onTertiary: palette.tertiary[20],
      tertiaryContainer: palette.tertiary[30],
      onTertiaryContainer: palette.tertiary[90],
      error: palette.error[80],
      onError: palette.error[20],
      errorContainer: palette.error[30],
      onErrorContainer: palette.error[90],
      // Surfaces (dark scheme)
      background: palette.neutral[10],
      onBackground: palette.neutral[90],
      surface: palette.neutral[10],
      onSurface: palette.neutral[90],
      surfaceVariant: palette.neutralVariant[30],
      onSurfaceVariant: palette.neutralVariant[80],
      outline: palette.neutralVariant[60],
      outlineVariant: palette.neutralVariant[30],
      // Elevation with primary tint
      elevation: {
        level0: palette.neutral[10],
        level1: `color-mix(in srgb, hsl(${palette.primary[80]}) 5%, hsl(${palette.neutral[10]}))`,
        level2: `color-mix(in srgb, hsl(${palette.primary[80]}) 8%, hsl(${palette.neutral[10]}))`,
        level3: `color-mix(in srgb, hsl(${palette.primary[80]}) 11%, hsl(${palette.neutral[10]}))`,
        level4: `color-mix(in srgb, hsl(${palette.primary[80]}) 12%, hsl(${palette.neutral[10]}))`,
        level5: `color-mix(in srgb, hsl(${palette.primary[80]}) 14%, hsl(${palette.neutral[10]}))`,
      },
    };
  }

  // Light scheme
  return {
    isDark,
    seedColor,
    palette,
    surfaces,
    primary: palette.primary[40],
    onPrimary: palette.primary[100],
    primaryContainer: palette.primary[90],
    onPrimaryContainer: palette.primary[10],
    secondary: palette.secondary[40],
    onSecondary: palette.secondary[100],
    secondaryContainer: palette.secondary[90],
    onSecondaryContainer: palette.secondary[10],
    tertiary: palette.tertiary[40],
    onTertiary: palette.tertiary[100],
    tertiaryContainer: palette.tertiary[90],
    onTertiaryContainer: palette.tertiary[10],
    error: palette.error[40],
    onError: palette.error[100],
    errorContainer: palette.error[90],
    onErrorContainer: palette.error[10],
    background: palette.neutral[99],
    onBackground: palette.neutral[10],
    surface: palette.neutral[99],
    onSurface: palette.neutral[10],
    surfaceVariant: palette.neutralVariant[90],
    onSurfaceVariant: palette.neutralVariant[30],
    outline: palette.neutralVariant[50],
    outlineVariant: palette.neutralVariant[80],
    elevation: {
      level0: palette.neutral[99],
      level1: `color-mix(in srgb, hsl(${palette.primary[40]}) 5%, hsl(${palette.neutral[99]}))`,
      level2: `color-mix(in srgb, hsl(${palette.primary[40]}) 8%, hsl(${palette.neutral[99]}))`,
      level3: `color-mix(in srgb, hsl(${palette.primary[40]}) 11%, hsl(${palette.neutral[99]}))`,
      level4: `color-mix(in srgb, hsl(${palette.primary[40]}) 12%, hsl(${palette.neutral[99]}))`,
      level5: `color-mix(in srgb, hsl(${palette.primary[40]}) 14%, hsl(${palette.neutral[99]}))`,
    },
  };
}

// Default seed color (Indigo)
const DEFAULT_SEED = "#6366f1";
const DEFAULT_NEUROTYPE: Neurotype = "1B";

// ============================================
// PROVIDER COMPONENT
// ============================================

interface MaterialYouProviderProps {
  children: React.ReactNode;
}

export function MaterialYouProvider({ children }: MaterialYouProviderProps) {
  const { user } = useAuth();

  // Detect dark mode from document.documentElement .dark class (set by next-themes)
  const [isDark, setIsDark] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  // Observe .dark class changes from next-themes
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    // Sync initial state
    setIsDark(root.classList.contains("dark"));
    return () => observer.disconnect();
  }, []);

  // Load preferences from localStorage
  const [preferences, setPreferences] = useState<ThemePreferences>(() => loadPreferences());

  // Fetch user's neurotype from profile
  const { data: userProfile } = useQuery({
    queryKey: ["user-neurotype", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data } = await supabase
        .from("profiles")
        .select("neurotype, coach_id, role, brand_color")
        .eq("id", user.id)
        .single();

      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch coach's brand color (fallback if no neurotype sync)
  const { data: coachBranding } = useQuery({
    queryKey: ["coach-brand-color", userProfile?.coach_id],
    queryFn: async () => {
      if (!userProfile?.coach_id) return null;

      const { data: coach } = await supabase
        .from("profiles")
        .select("brand_color")
        .eq("id", userProfile.coach_id)
        .single();

      return coach?.brand_color || null;
    },
    enabled: !!userProfile?.coach_id,
    staleTime: 10 * 60 * 1000,
  });

  // Parse neurotype from profile
  const userNeurotype: Neurotype | null = useMemo(() => {
    const nt = userProfile?.neurotype;
    if (nt && (nt === "1A" || nt === "1B" || nt === "2A" || nt === "2B" || nt === "3")) {
      return nt as Neurotype;
    }
    return null;
  }, [userProfile?.neurotype]);

  // Get neurotype color
  const neurotypeSeedColor = useMemo(() => {
    const nt = userNeurotype || DEFAULT_NEUROTYPE;
    return NEUROTYPE_COLORS[nt].hex;
  }, [userNeurotype]);

  // Determine final seed color based on role and preferences
  // COACH: usa esclusivamente il proprio brand_color (o default Indigo). Ignora Neuro-Sync.
  // ATHLETE: rispetta Neuro-Sync, override manuale, oppure eredita dal brand_color del coach.
  const seedColor = useMemo(() => {
    const isCoach = userProfile?.role === "coach";
    if (isCoach) {
      return userProfile?.brand_color || DEFAULT_SEED;
    }
    if (preferences.isNeuroSyncEnabled) {
      return neurotypeSeedColor;
    }
    return preferences.manualColor || coachBranding || DEFAULT_SEED;
  }, [
    userProfile?.role,
    userProfile?.brand_color,
    preferences.isNeuroSyncEnabled,
    preferences.manualColor,
    neurotypeSeedColor,
    coachBranding,
  ]);

  // Generate theme
  const theme = useMemo(() => {
    return generateTheme(seedColor, isDark);
  }, [seedColor, isDark]);

  // Persist preferences when they change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  // Apply CSS custom properties to document
  useEffect(() => {
    const root = document.documentElement;
    const t = theme;

    // Material You semantic tokens (--m3-*)
    root.style.setProperty("--m3-primary", t.primary);
    root.style.setProperty("--m3-on-primary", t.onPrimary);
    root.style.setProperty("--m3-primary-container", t.primaryContainer);
    root.style.setProperty("--m3-on-primary-container", t.onPrimaryContainer);
    root.style.setProperty("--m3-secondary", t.secondary);
    root.style.setProperty("--m3-on-secondary", t.onSecondary);
    root.style.setProperty("--m3-secondary-container", t.secondaryContainer);
    root.style.setProperty("--m3-on-secondary-container", t.onSecondaryContainer);
    root.style.setProperty("--m3-tertiary", t.tertiary);
    root.style.setProperty("--m3-on-tertiary", t.onTertiary);
    root.style.setProperty("--m3-tertiary-container", t.tertiaryContainer);
    root.style.setProperty("--m3-on-tertiary-container", t.onTertiaryContainer);
    root.style.setProperty("--m3-error", t.error);
    root.style.setProperty("--m3-on-error", t.onError);
    root.style.setProperty("--m3-error-container", t.errorContainer);
    root.style.setProperty("--m3-on-error-container", t.onErrorContainer);
    root.style.setProperty("--m3-background", t.background);
    root.style.setProperty("--m3-on-background", t.onBackground);
    root.style.setProperty("--m3-surface", t.surface);
    root.style.setProperty("--m3-on-surface", t.onSurface);
    root.style.setProperty("--m3-surface-variant", t.surfaceVariant);
    root.style.setProperty("--m3-on-surface-variant", t.onSurfaceVariant);
    root.style.setProperty("--m3-outline", t.outline);
    root.style.setProperty("--m3-outline-variant", t.outlineVariant);

    // Surface containers
    root.style.setProperty("--m3-surface-container-lowest", t.surfaces.surfaceContainerLowest);
    root.style.setProperty("--m3-surface-container-low", t.surfaces.surfaceContainerLow);
    root.style.setProperty("--m3-surface-container", t.surfaces.surfaceContainer);
    root.style.setProperty("--m3-surface-container-high", t.surfaces.surfaceContainerHigh);
    root.style.setProperty("--m3-surface-container-highest", t.surfaces.surfaceContainerHighest);

    // Seed color for reference
    root.style.setProperty("--m3-seed", seedColor);

    // =============================================
    // BRIDGE: Map M3 tokens → Standard Tailwind CSS vars
    // This makes bg-primary, text-foreground etc. reactive
    // =============================================
    root.style.setProperty("--primary", `hsl(${t.primary})`);
    root.style.setProperty("--primary-foreground", `hsl(${t.onPrimary})`);
    root.style.setProperty("--background", `hsl(${t.background})`);
    root.style.setProperty("--foreground", `hsl(${t.onBackground})`);
    root.style.setProperty("--card", `hsl(${t.surfaces.surfaceContainerLow})`);
    root.style.setProperty("--card-foreground", `hsl(${t.onSurface})`);
    root.style.setProperty("--popover", `hsl(${t.surfaces.surfaceContainerLow})`);
    root.style.setProperty("--popover-foreground", `hsl(${t.onSurface})`);
    root.style.setProperty("--secondary", `hsl(${t.secondaryContainer})`);
    root.style.setProperty("--secondary-foreground", `hsl(${t.onSecondaryContainer})`);
    root.style.setProperty("--muted", `hsl(${t.surfaces.surfaceContainerHigh})`);
    root.style.setProperty("--muted-foreground", `hsl(${t.onSurfaceVariant})`);
    root.style.setProperty("--accent", `hsl(${t.tertiaryContainer})`);
    root.style.setProperty("--accent-foreground", `hsl(${t.onTertiaryContainer})`);
    root.style.setProperty("--destructive", `hsl(${t.error})`);
    root.style.setProperty("--destructive-foreground", `hsl(${t.onError})`);
    root.style.setProperty("--border", `hsl(${t.outlineVariant})`);
    root.style.setProperty("--input", `hsl(${t.outlineVariant})`);
    root.style.setProperty("--ring", `hsl(${t.primary})`);
  }, [theme, seedColor]);

  // Handlers
  const setNeuroSyncEnabled = useCallback((enabled: boolean) => {
    setPreferences((prev) => ({ ...prev, isNeuroSyncEnabled: enabled }));
  }, []);

  const setManualColor = useCallback((color: string | null) => {
    setPreferences((prev) => ({ ...prev, manualColor: color }));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setSeedColor: setManualColor,
      isNeuroSyncEnabled: preferences.isNeuroSyncEnabled,
      setNeuroSyncEnabled,
      manualColor: preferences.manualColor,
      setManualColor,
      userNeurotype,
      neurotypeSeedColor,
    }),
    [theme, preferences, setNeuroSyncEnabled, setManualColor, userNeurotype, neurotypeSeedColor],
  );

  return <MaterialYouContext.Provider value={value}>{children}</MaterialYouContext.Provider>;
}

// ============================================
// HOOK
// ============================================

function useMaterialYou() {
  const context = useContext(MaterialYouContext);
  if (!context) {
    throw new Error("useMaterialYou must be used within a MaterialYouProvider");
  }
  return context;
}

// ============================================
// UTILITY CLASSES (for Tailwind integration)
// ============================================

const m3 = {
  // Surfaces
  surface: "bg-[hsl(var(--m3-surface))]",
  surfaceContainer: "bg-[hsl(var(--m3-surface-container))]",
  surfaceContainerHigh: "bg-[hsl(var(--m3-surface-container-high))]",
  surfaceContainerHighest: "bg-[hsl(var(--m3-surface-container-highest))]",

  // Primary
  primary: "bg-[hsl(var(--m3-primary))]",
  onPrimary: "text-[hsl(var(--m3-on-primary))]",
  primaryContainer: "bg-[hsl(var(--m3-primary-container))]",
  onPrimaryContainer: "text-[hsl(var(--m3-on-primary-container))]",

  // Text colors
  onSurface: "text-[hsl(var(--m3-on-surface))]",
  onSurfaceVariant: "text-[hsl(var(--m3-on-surface-variant))]",

  // Outline
  outline: "border-[hsl(var(--m3-outline))]",
  outlineVariant: "border-[hsl(var(--m3-outline-variant))]",
} as const;
