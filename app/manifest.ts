import type { MetadataRoute } from "next";

// Served by Next at /manifest.webmanifest and auto-linked in <head>.
// This is what makes the app installable ("Add to Home Screen").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zorfit",
    short_name: "Zorfit",
    description:
      "A friendly fitness coach: calorie & protein targets, easy food logging, workouts and weight tracking.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
