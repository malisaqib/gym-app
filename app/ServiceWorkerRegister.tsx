"use client";

import { useEffect } from "react";

// Registers the service worker (production only, so dev isn't affected by
// caching). Renders nothing.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures shouldn't break the app.
      });
    }
  }, []);
  return null;
}
