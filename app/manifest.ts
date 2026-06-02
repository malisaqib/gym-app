import type { MetadataRoute } from "next";

// Served by Next at /manifest.webmanifest and auto-linked in <head>.
// This is what makes the app installable ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Desi Fitness Coach",
    short_name: "Fit Coach",
    description:
      "A friendly desi fitness coach: calorie & protein targets, easy food logging, workouts and weight tracking.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#10b981",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
