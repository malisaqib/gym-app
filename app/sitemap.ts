import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/site/url";

// Served by Next at /sitemap.xml. Only public, indexable URLs belong here — no
// /dashboard, auth pages, API routes, or user-specific pages. The homepage is
// currently the single public marketing page; add legal/about pages here later.
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getPublicSiteUrl();

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
