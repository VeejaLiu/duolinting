import type { MetadataRoute } from "next";
import { officialSiteHref, officialSiteUrl } from "./content/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: officialSiteHref("/sitemap.xml"),
    host: new URL(officialSiteUrl).host,
  };
}
