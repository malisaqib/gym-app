import { cookies } from "next/headers";

/**
 * The user's LOCAL "today" as YYYY-MM-DD, computed on the SERVER.
 *
 * The server runs in UTC and doesn't know the user's timezone, so we read a `tz`
 * cookie (an IANA zone like "Asia/Karachi") that the client sets once on load
 * (see components/TimezoneCookie.tsx). Intl with `en-CA` formats as YYYY-MM-DD.
 * Falls back to UTC before the cookie exists (first visit only).
 */
export async function getLocalToday(): Promise<string> {
  const tz = (await cookies()).get("tz")?.value;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(new Date());
  } catch {
    // Bad/unknown tz value — fall back to UTC.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
}
