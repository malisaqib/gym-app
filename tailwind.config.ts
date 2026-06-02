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
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      borderRadius: {
        field: "0.875rem", // 14px — inputs & buttons
        card: "1.125rem", // 18px — cards
        pill: "9999px",
      },
      boxShadow: {
        soft: "0 1px 3px rgb(28 26 22 / 0.06), 0 1px 2px rgb(28 26 22 / 0.04)",
        pop: "0 4px 16px rgb(28 26 22 / 0.08)",
        nav: "0 -2px 24px rgb(28 26 22 / 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
