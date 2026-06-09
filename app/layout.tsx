import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
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
  title: "FitCoach",
  description:
    "A simple fitness coach for beginners — calorie & protein targets and easy food logging.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FitCoach",
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
  themeColor: "#10b981",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        {/* Follow the OS light/dark setting (and react to live changes). Runs
            during parse so the theme is set before content paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){document.documentElement.classList.toggle('dark',m.matches);}a();m.addEventListener?m.addEventListener('change',a):m.addListener(a);}catch(e){}})();`,
          }}
        />
        {children}
        <ToastViewport />
        <ServiceWorkerRegister />
        <TimezoneCookie />
      </body>
    </html>
  );
}
