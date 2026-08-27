import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
      // Sub-`xs` font tokens for compact UI (badges, labels, table micro-text).
      // Closes audit finding B3 — replaces ad-hoc `text-[Npx]` arbitrary
      // values with semantic tokens that respond to design-system updates.
      //   text-2xs → 11px  (audit B3: replaces `text-[11px]`)
      //   text-3xs → 10px  (audit B3: replaces `text-[10px]`)
      //   text-4xs → 9px   (audit B3: replaces `text-[9px]`)
      //   text-5xs → 8px   (audit B3: replaces `text-[8px]`)
      fontSize: {
        // Sub-`xs` compact tokens (audit B3) — replace ad-hoc `text-[Npx]`.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        "3xs": ["0.625rem", { lineHeight: "0.875rem" }],
        "4xs": ["0.5625rem", { lineHeight: "0.75rem" }],
        "5xs": ["0.5rem", { lineHeight: "0.75rem" }],
        // Aura Health System typography tokens (DESIGN.md).
        // Exposed so consumers can use `text-label-md`, `text-body-md`,
        // `text-headline-lg`, etc. directly — single source of truth for
        // size + line-height + weight + letter-spacing.
        "label-md": [
          "0.875rem",
          { lineHeight: "1.25rem", letterSpacing: "0.01em", fontWeight: "600" },
        ],
        "body-md": ["1rem", { lineHeight: "1.5rem", fontWeight: "400" }],
        "body-lg": ["1.125rem", { lineHeight: "1.75rem", fontWeight: "400" }],
        "headline-md": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        "headline-lg": [
          "2rem",
          { lineHeight: "2.5rem", letterSpacing: "-0.01em", fontWeight: "700" },
        ],
        "headline-lg-mobile": ["1.75rem", { lineHeight: "2.25rem", fontWeight: "700" }],
        "display-lg": [
          "3rem",
          { lineHeight: "3.5rem", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
      },
      colors: {
        /* Athlete brand palette — namespaced to avoid colliding with Coach semantic tokens */
        brand: {
          DEFAULT: "#005685",
          container: "#226fa3",
          foreground: "#ffffff",
        },
        surface: {
          DEFAULT: "#f5faff",
          variant: "#c5e7ff",
          container: "#def0ff",
        },
        "on-surface": {
          DEFAULT: "#001e2d",
          variant: "#40474f",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        /* Material 3 error family. `error` is the strong colour,
           `error-container` the tint that carries it on a surface — the
           distinction the Coach severity pills rely on, and the reason these
           are not folded into `destructive`.
           Since 2026-08-27 EVERY token in this file uses the
           `hsl(var(--x) / <alpha-value>)` form: a naked `var(--x)` makes
           Tailwind v3 drop the opacity modifier without emitting any rule
           (139 classes measured dead on the built CSS). Every matching var
           in `src/index.css` holds bare HSL channels; check 7 of
           scripts/verify-css-tokens.mjs scans the sources and goes red on
           any opacity-modified class with no emitted rule. */
        error: {
          DEFAULT: "hsl(var(--error) / <alpha-value>)",
          container: "hsl(var(--error-container) / <alpha-value>)",
        },
        "on-error-container": "hsl(var(--on-error-container) / <alpha-value>)",
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          primary: "hsl(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
        },
        /* Aura Health System — Material 3 inspired surface roles.
           These map 1:1 to the CSS vars defined in `src/index.css`
           so components can reach them via `bg-surface-container`,
           `border-outline-variant`, `text-on-surface-variant`, etc.
           Note: `bg-surface` (no suffix) is NOT mapped here because the
           legacy athlete namespace `surface.{DEFAULT,variant,container}`
           above would conflict. Use `bg-background` for the base Aura
           surface — they're CSS-var-identical (`--background`). */
        outline: {
          DEFAULT: "hsl(var(--outline) / <alpha-value>)",
          variant: "hsl(var(--outline-variant) / <alpha-value>)",
        },
        "on-surface-variant": "hsl(var(--on-surface-variant) / <alpha-value>)",
        "surface-container-lowest": "hsl(var(--surface-container-lowest) / <alpha-value>)",
        "surface-container-low": "hsl(var(--surface-container-low) / <alpha-value>)",
        "surface-container": "hsl(var(--surface-container) / <alpha-value>)",
        "surface-container-high": "hsl(var(--surface-container-high) / <alpha-value>)",
        "surface-container-highest": "hsl(var(--surface-container-highest) / <alpha-value>)",
        "primary-container": "hsl(var(--primary-container) / <alpha-value>)",
        "on-primary-container": "hsl(var(--on-primary-container) / <alpha-value>)",
        tertiary: {
          DEFAULT: "hsl(var(--tertiary) / <alpha-value>)",
          foreground: "hsl(var(--tertiary-foreground) / <alpha-value>)",
        },
        /* The severity chips that use these want a tint. The
           MaterialYouProvider BRIDGE does not overwrite them at runtime;
           the vars it DOES overwrite are written as bare channels there,
           for the same reason every entry here wraps in hsl(). */
        "tertiary-container": "hsl(var(--tertiary-container) / <alpha-value>)",
        "on-tertiary-container": "hsl(var(--on-tertiary-container) / <alpha-value>)",
        "inverse-surface": "hsl(var(--inverse-surface) / <alpha-value>)",
        "inverse-on-surface": "hsl(var(--inverse-on-surface) / <alpha-value>)",
        "inverse-primary": "hsl(var(--inverse-primary) / <alpha-value>)",
        /* Semantic chart palette. One vocabulary: a colour is named for
           WHAT it represents (volume, load, velocity…), never numbered —
           nobody can notice a wrong number, `chart-fatigue` can be caught.
           Channel form like the error family: the stat-tile call sites want
           a tint (`bg-chart-volume/10`) and `var(--x)` alone would make
           Tailwind drop the opacity modifier without emitting anything. */
        chart: {
          volume: "hsl(var(--chart-volume) / <alpha-value>)",
          intensity: "hsl(var(--chart-intensity) / <alpha-value>)",
          fatigue: "hsl(var(--chart-fatigue) / <alpha-value>)",
          grid: "hsl(var(--chart-grid) / <alpha-value>)",
          axis: "hsl(var(--chart-axis) / <alpha-value>)",
          muted: "hsl(var(--chart-muted) / <alpha-value>)",
          calories: "hsl(var(--chart-calories) / <alpha-value>)",
          weight: "hsl(var(--chart-weight) / <alpha-value>)",
          frequency: "hsl(var(--chart-frequency) / <alpha-value>)",
          load: "hsl(var(--chart-load) / <alpha-value>)",
          velocity: "hsl(var(--chart-velocity) / <alpha-value>)",
          power: "hsl(var(--chart-power) / <alpha-value>)",
          "acwr-low": "hsl(var(--chart-acwr-low) / <alpha-value>)",
        },
      },
      borderRadius: {
        /* Aura shape language — ultra-rounded / organic. The DEFAULT
           is 1rem (16px) per DESIGN.md; aliased so `rounded-lg`/`md`
           remain the legacy mid-step values, and the new `2xl`/`3xl`
           expose the 24px and 32px card targets directly. */
        sm: "calc(var(--radius) - 0.5rem)" /* 0.5rem */,
        md: "var(--radius)" /* 1rem */,
        lg: "calc(var(--radius) + 0.5rem)" /* 1.5rem — Form inputs */,
        xl: "calc(var(--radius) + 1rem)" /* 2rem */,
        "2xl": "calc(var(--radius) + 0.5rem)" /* 24px — Cards lower bound */,
        "3xl": "calc(var(--radius) + 1rem)" /* 32px — Cards upper bound */,
      },
      boxShadow: {
        /* Aura ambient shadow — wide and soft, gives the "float" effect
           described in DESIGN.md without harsh drop. Cards get `aura`,
           inputs use `aura-focus` on focus. */
        aura: "0 8px 30px rgba(0, 0, 0, 0.04)",
        "aura-hover": "0 12px 40px rgba(0, 0, 0, 0.06)",
        "aura-focus": "0 0 0 4px hsl(204 100% 26% / 0.12)",
      },
      backdropBlur: {
        aura: "20px",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "scan-line": {
          "0%": { top: "0%", opacity: "0.2" },
          "50%": { top: "100%", opacity: "1" },
          "100%": { top: "0%", opacity: "0.2" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "scan-line": "scan-line 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
