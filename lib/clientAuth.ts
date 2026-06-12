/**
 * Session-expiry escape hatch for the installed PWA. Server actions answer
 * "Not signed in." once the session lapses; without this, a user who kept the
 * app open for days just sees that error on every tap with no way back.
 * Returns true when it triggered the redirect (caller should stop).
 */
const SIGNED_OUT = "Not signed in.";

export function redirectIfSignedOut(error: string | null | undefined): boolean {
  if (error !== SIGNED_OUT) return false;
  if (typeof window !== "undefined") window.location.href = "/login";
  return true;
}
