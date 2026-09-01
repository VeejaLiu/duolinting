import type { MetadataRoute } from "next";
import { officialSiteHref, officialSiteUrl } from "./content/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: officialSiteHref("/sitemap.xml"),
    // `host` is a Yandex-specific directive; Google and Bing ignore it.
    // It is harmless to keep and helps the rare Yandex crawl.
    host: new URL(officialSiteUrl).host,
  };
}
