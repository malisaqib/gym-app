/**
 * The browser's CURRENT local calendar day as YYYY-MM-DD.
 *
 * Pure + client-safe (no next/headers). Uses local date components, so it flips
 * at the user's local midnight — which is what we want for "what day did I log
 * this on". Matches the server's tz-cookie day (lib/date.ts getLocalToday) once
 * the timezone cookie is set.
 *
 * Why this exists: food logs must be written with the user's LIVE local day, not
 * a date frozen at server render. A frozen day goes stale across midnight (and
 * during the first-visit UTC fallback), making items land on the wrong day so
 * the dashboard later queries a different day and they appear to vanish.
 */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
