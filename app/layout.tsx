import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { MotionConfig } from "motion/react";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import TimezoneCookie from "@/components/TimezoneCookie";
import { ToastViewport } from "@/components/ui/Toast";

// Typography: Inter (self-hosted via next/font) is the app-wide typeface — the
// closest open match to San Francisco for the Apple-Fitness feel. Exposed as the
// --font-inter CSS variable, which the Tailwind `sans`/`display` stacks consume.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  // Resolves relative icon/OG URLs to absolute ones on the live domain so link
  // previews (WhatsApp, iMessage, X, etc.) load the icon correctly.
  metadataBase: new URL("https://www.zorfit.app"),
  title: "Zorfit",
  description:
    "A simple fitness coach for beginners — calorie & protein targets and easy food logging.",
  appleWebApp: {
    capable: true,
    // Deep-black app: let content draw under a translucent status bar.
    statusBarStyle: "black-translucent",
    title: "Zorfit",
  },
  icons: {
    icon: [
      // SVG first so capable browsers use the crisp vector favicon.
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Link-share preview (the app icon + name). A dedicated 1200×630 banner would
  // look nicer later, but the square icon is a clean, correct default.
  openGraph: {
    type: "website",
    siteName: "Zorfit",
    title: "Zorfit — fitness made simple",
    description:
      "Calorie & protein targets, easy food logging (desi + western, Roman Urdu), simple meal & workout plans.",
    url: "https://www.zorfit.app",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Zorfit" }],
  },
  twitter: {
    card: "summary",
    title: "Zorfit — fitness made simple",
    description:
      "Calorie & protein targets, easy food logging (desi + western, Roman Urdu), simple meal & workout plans.",
    images: ["/icon-512.png"],
  },
};

// Mobile-first: device-width, allow the app to draw under the notch (iOS).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000", // deep-black browser chrome to match the app
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `fitness` makes the Apple-Fitness deep-black theme the single app-wide theme
    // (no OS light/dark toggle — the app is dark by design, like Apple Fitness).
    <html lang="en" className={`${inter.variable} fitness`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* One global motion policy: every Framer animation respects the user's
            "reduce motion" OS setting. */}
        <MotionConfig reducedMotion="user">
          {children}
          <ToastViewport />
        </MotionConfig>
        <ServiceWorkerRegister />
        <TimezoneCookie />
      </body>
    </html>
  );
}
