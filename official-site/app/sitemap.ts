import type { MetadataRoute } from "next";
import { officialSiteHref } from "./content/site-url";
import { landingPages } from "./content/landing-pages";
import { blogPosts } from "./content/blog-posts";

// Each public page carries its own lastModified so crawlers can tell which
// documents actually changed instead of treating every build as a full-site
// update. Keep these dates in sync with the "last updated" copy rendered on
// the page itself (e.g. the contribution guide says 2026-08-21).
const zhHome = new Date("2026-08-29T00:00:00.000Z");
const enHome = new Date("2026-08-29T00:00:00.000Z");
const download = new Date("2026-08-29T00:00:00.000Z");
const contribute = new Date("2026-08-21T00:00:00.000Z");
const legal = new Date("2026-08-29T00:00:00.000Z");

/** One sitemap entry per localized landing page, dated from the data file. */
const landingPageEntries = landingPages.flatMap((page) => {
  const modified = new Date(`${page.lastModified}T00:00:00.000Z`);
  return [
    { url: officialSiteHref(`/practice/${page.slug}`), lastModified: modified, changeFrequency: "monthly" as const, priority: 0.7 },
    { url: officialSiteHref(`/en/practice/${page.slug}`), lastModified: modified, changeFrequency: "monthly" as const, priority: 0.6 },
  ];
});

/** Blog index + one sitemap entry per localized post, dated from the data file. */
const blogEntries = blogPosts.flatMap((post) => {
  const modified = new Date(`${post.lastModified}T00:00:00.000Z`);
  return [
    { url: officialSiteHref(`/blog/${post.slug}`), lastModified: modified, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: officialSiteHref(`/en/blog/${post.slug}`), lastModified: modified, changeFrequency: "monthly" as const, priority: 0.5 },
  ];
});

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: officialSiteHref("/"), lastModified: zhHome, changeFrequency: "weekly", priority: 1 },
    { url: officialSiteHref("/download"), lastModified: download, changeFrequency: "weekly", priority: 0.9 },
    { url: officialSiteHref("/contribute"), lastModified: contribute, changeFrequency: "monthly", priority: 0.9 },
    { url: officialSiteHref("/support"), lastModified: legal, changeFrequency: "yearly", priority: 0.7 },
    { url: officialSiteHref("/privacy"), lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: officialSiteHref("/terms"), lastModified: legal, changeFrequency: "yearly", priority: 0.3 },
    { url: officialSiteHref("/en"), lastModified: enHome, changeFrequency: "weekly", priority: 0.8 },
    { url: officialSiteHref("/en/download"), lastModified: download, changeFrequency: "weekly", priority: 0.7 },
    { url: officialSiteHref("/en/contribute"), lastModified: contribute, changeFrequency: "monthly", priority: 0.7 },
    { url: officialSiteHref("/en/support"), lastModified: legal, changeFrequency: "yearly", priority: 0.6 },
    { url: officialSiteHref("/en/privacy"), lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    { url: officialSiteHref("/en/terms"), lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    { url: officialSiteHref("/blog"), lastModified: blogPosts[0] ? new Date(`${blogPosts[0].lastModified}T00:00:00.000Z`) : legal, changeFrequency: "weekly", priority: 0.7 },
    { url: officialSiteHref("/en/blog"), lastModified: blogPosts[0] ? new Date(`${blogPosts[0].lastModified}T00:00:00.000Z`) : legal, changeFrequency: "weekly", priority: 0.6 },
    ...landingPageEntries,
    ...blogEntries,
  ];
}
