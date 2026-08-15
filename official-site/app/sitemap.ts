import type { MetadataRoute } from "next";
import { officialSiteHref } from "./content/site-url";

// Update this date when a public page changes materially. Keeping it explicit
// avoids telling crawlers that every build changed every document.
const lastUpdated = new Date("2026-08-16T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: officialSiteHref("/"), lastModified: lastUpdated, changeFrequency: "weekly", priority: 1 },
    { url: officialSiteHref("/download"), lastModified: lastUpdated, changeFrequency: "weekly", priority: 0.9 },
    { url: officialSiteHref("/contribute"), lastModified: lastUpdated, changeFrequency: "monthly", priority: 0.9 },
    { url: officialSiteHref("/privacy"), lastModified: lastUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: officialSiteHref("/terms"), lastModified: lastUpdated, changeFrequency: "yearly", priority: 0.3 },
    { url: officialSiteHref("/en"), lastModified: lastUpdated, changeFrequency: "weekly", priority: 0.8 },
    { url: officialSiteHref("/en/download"), lastModified: lastUpdated, changeFrequency: "weekly", priority: 0.7 },
    { url: officialSiteHref("/en/contribute"), lastModified: lastUpdated, changeFrequency: "monthly", priority: 0.7 },
    { url: officialSiteHref("/en/privacy"), lastModified: lastUpdated, changeFrequency: "yearly", priority: 0.2 },
    { url: officialSiteHref("/en/terms"), lastModified: lastUpdated, changeFrequency: "yearly", priority: 0.2 },
  ];
}
