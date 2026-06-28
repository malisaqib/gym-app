import type { MetadataRoute } from "next";

// Served by Next at /robots.txt. Crawlers may index the public homepage; the
// signed-in app, auth/API endpoints, and auth utility pages are kept out of the
// index (the app routes are auth-gated anyway). Points crawlers at the sitemap.
const siteUrl = "https://www.zorfit.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Private, auth-gated app sections
          "/dashboard",
          "/onboarding",
          "/workout",
          "/coach",
          "/diet",
          "/settings",
          "/weight",
          // Backend routes + auth callback
          "/api",
          "/auth",
          // Auth / conversion utility pages (no search value)
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          // Internal design preview
          "/design",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
