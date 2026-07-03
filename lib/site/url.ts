const DEFAULT_PUBLIC_SITE_URL = "https://www.zorfit.app";

/**
 * Canonical public site URL for email links and redirects.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://www.zorfit.app).
 */
export function getSiteUrl(): string {
  const fromEnv =
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeSiteOrigin(process.env.SITE_URL);
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}

/**
 * Canonical public origin for SEO files. Unlike getSiteUrl(), this must never
 * fall back to localhost because sitemap.xml and robots.txt are public crawler
 * surfaces.
 */
export function getPublicSiteUrl(): string {
  const fromEnv =
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeSiteOrigin(process.env.SITE_URL);

  if (fromEnv && !isLocalOrigin(fromEnv)) return fromEnv;
  return DEFAULT_PUBLIC_SITE_URL;
}

function normalizeSiteOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
