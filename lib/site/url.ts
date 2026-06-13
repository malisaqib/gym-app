/**
 * Canonical public site URL for email links and redirects.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://www.zorfit.app).
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}
