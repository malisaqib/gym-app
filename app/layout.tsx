import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import TimezoneCookie from "@/components/TimezoneCookie";
import { ToastViewport } from "@/components/ui/Toast";

// Typography: we deliberately use the native system font (San Francisco on
// iOS/macOS) via the stack in tailwind.config. No web-font download — it loads
// instantly and gives the app a true, native iPhone-app look and feel.

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
    <html lang="en">
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
