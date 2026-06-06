"use client";

import { useEffect } from "react";
import { clearLocalCoachData } from "@/lib/coach/localStore";

/**
 * Device-local coach data (budget, check-ins, motivation goal, training setup,
 * intro flag) lives in localStorage under global keys. On a SHARED device, that
 * could leak from one account to the next. This guard stamps the current user as
 * the "owner" of the local data and wipes it whenever a DIFFERENT user is seen
 * (a new login, or a session change) — so each user only ever sees their own.
 * Renders nothing. (The proper long-term fix is moving these to Supabase.)
 */
const OWNER_KEY = "gymCoach.owner";

export default function LocalDataGuard({ userId }: { userId: string }) {
  useEffect(() => {
    try {
      const owner = window.localStorage.getItem(OWNER_KEY);
      if (owner !== userId) {
        clearLocalCoachData(); // also removes the stale owner key
        window.localStorage.setItem(OWNER_KEY, userId);
      }
    } catch {
      // localStorage unavailable — nothing to guard.
    }
  }, [userId]);

  return null;
}
