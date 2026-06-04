import type { Config } from "tailwindcss";

// Colors are CSS variables (defined in globals.css) stored as "R G B" channels,
// so Tailwind's opacity modifiers still work, e.g. bg-primary/90.
const color = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  // Dark palette is defined and ready; we opt in via a `dark` class later
  // (kept off for now so half-redesigned screens don't show a broken dark mode).
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: color("background"),
        foreground: color("foreground"),
        card: color("card"),
        "card-foreground": color("card-foreground"),
        muted: color("muted"),
        "muted-foreground": color("muted-foreground"),
        border: color("border"),
        input: color("input"),
        ring: color("ring"),
        primary: color("primary"),
        "primary-foreground": color("primary-foreground"),
        "primary-soft": color("primary-soft"),
        accent: color("accent"),
        "accent-foreground": color("accent-foreground"),
        success: color("success"),
        "success-foreground": color("success-foreground"),
        warning: color("warning"),
        "warning-foreground": color("warning-foreground"),
        destructive: color("destructive"),
        "destructive-foreground": color("destructive-foreground"),
      },
      fontFamily: {
        // Native system font — renders San Francisco on iOS/macOS (the true
        // iPhone-app feel), Segoe UI on Windows, Roboto on Android. Zero download.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Segoe UI"',
          "system-ui",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
        ],
        // Larger headings use SF Pro Display on Apple devices automatically.
        display: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Segoe UI"',
          "system-ui",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        field: "0.875rem", // 14px — inputs & buttons
        card: "1.125rem", // 18px — cards
        pill: "9999px",
      },
      boxShadow: {
        // Layered, low-contrast elevation — soft and premium, never harsh.
        soft: "0 1px 2px rgb(28 26 22 / 0.04), 0 2px 8px rgb(28 26 22 / 0.05)",
        pop: "0 2px 8px rgb(28 26 22 / 0.06), 0 12px 32px rgb(28 26 22 / 0.10)",
        nav: "0 -1px 0 rgb(28 26 22 / 0.04), 0 -10px 32px rgb(28 26 22 / 0.10)",
        ring: "0 0 0 1px rgb(28 26 22 / 0.04)", // crisp hairline on light surfaces
      },
      transitionTimingFunction: {
        // iOS-ish ease-out: quick to react, gentle to settle.
        ios: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
