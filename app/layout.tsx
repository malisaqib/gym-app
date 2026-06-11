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
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
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
