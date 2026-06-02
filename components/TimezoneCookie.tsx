"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Tells the server the user's timezone via a `tz` cookie, so server components
 * can compute the correct local "today" (see lib/date.ts). Sets it once; if it
 * was missing/wrong, refreshes the route a single time so the server re-renders
 * with the right date. The ref guard prevents any refresh loop (e.g. if cookies
 * are blocked). Renders nothing.
 */
export default function TimezoneCookie() {
  const router = useRouter();
  const refreshed = useRef(false);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const match = document.cookie.match(/(?:^|; )tz=([^;]+)/);
    const current = match ? decodeURIComponent(match[1]) : null;
    if (current === tz) return; // already correct

    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; SameSite=Lax`;
    if (!refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [router]);

  return null;
}
