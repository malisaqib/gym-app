import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import TimezoneCookie from "@/components/TimezoneCookie";

// Body / UI / numbers — clean humanist sans with tabular figures.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Headlines / greetings — soft serif for warmth and identity.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  weight: ["500", "600"],
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
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {/* Follow the OS light/dark setting (and react to live changes). Runs
            during parse so the theme is set before content paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');function a(){document.documentElement.classList.toggle('dark',m.matches);}a();m.addEventListener?m.addEventListener('change',a):m.addListener(a);}catch(e){}})();`,
          }}
        />
        {children}
        <ServiceWorkerRegister />
        <TimezoneCookie />
      </body>
    </html>
  );
}
