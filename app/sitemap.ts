import type { MetadataRoute } from "next";

// Served by Next at /sitemap.xml. Only public, indexable URLs belong here — no
// /dashboard, auth pages, API routes, or user-specific pages. The homepage is
// currently the single public marketing page; add legal/about pages here later.
const siteUrl = "https://www.zorfit.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
