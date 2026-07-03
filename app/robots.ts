import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/site/url";

// Served by Next at /robots.txt. Crawlers may index the public homepage; the
// signed-in app, auth/API endpoints, and auth utility pages are kept out of the
// index (the app routes are auth-gated anyway). Points crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicSiteUrl();

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
