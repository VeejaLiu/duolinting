/**
 * The public origin is used only in generated metadata and crawler files.
 * It is a build-time public value, so it must never contain credentials or
 * private infrastructure addresses.
 */
const fallbackOfficialSiteUrl = "https://www.duolinting.cn";

function normalizePublicOrigin(value: string | undefined) {
  try {
    return new URL(value?.trim() || fallbackOfficialSiteUrl).origin;
  } catch {
    // Keep canonical URLs stable if an optional local environment value is invalid.
    return fallbackOfficialSiteUrl;
  }
}

export const officialSiteUrl = normalizePublicOrigin(import.meta.env.VITE_OFFICIAL_SITE_URL);

export function officialSiteHref(pathname = "/") {
  return new URL(pathname, officialSiteUrl).toString();
}

/**
 * Chinese routes are canonical by default; English has its own public route
 * so crawlers can index a single language per URL instead of a client toggle.
 */
export function localizedAlternates(pathname = "/", locale: "zh" | "en" = "zh") {
  const englishPathname = pathname === "/" ? "/en" : `/en${pathname}`;

  return {
    canonical: locale === "en" ? englishPathname : pathname,
    languages: {
      "zh-CN": pathname,
      en: englishPathname,
      "x-default": pathname,
    },
  };
}
