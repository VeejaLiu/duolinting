import { officialSiteHref } from "../content/site-url";

type JsonLd = Record<string, unknown>;

function jsonLdPayload(value: JsonLd) {
  // Escape '<' so JSON-LD text cannot close its script tag if future content
  // includes a user-controlled string.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function StructuredData({ value }: { value: JsonLd }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdPayload(value) }} />;
}

export const organizationSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "DuolinTing",
  alternateName: "多邻听",
  url: officialSiteHref(),
  logo: officialSiteHref("/duolinting-logo-ear.png"),
  sameAs: [
    "https://github.com/VeejaLiu/duolinting",
    "https://discord.com/users/924180303487066182",
  ],
};

export const softwareApplicationSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DuolinTing",
  alternateName: "多邻听",
  applicationCategory: "EducationalApplication",
  applicationSubCategory: "Language learning",
  operatingSystem: "Web, Android",
  url: officialSiteHref(),
  image: officialSiteHref("/learner-web.webp"),
  screenshot: officialSiteHref("/learner-web.webp"),
  description: "Practice listening with real audio and video through warm-up listening, line-by-line practice, and difficult-line review.",
  inLanguage: ["zh-CN", "en"],
  featureList: [
    "Warm-up (extensive) listening",
    "Line-by-line intensive listening",
    "Difficult-line review",
    "Loop a line and change playback speed",
    "Subtitles, translations, and dictation",
    "Vocabulary and notes",
    "Cross-device learning progress",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "CNY",
  },
};

export const websiteSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "DuolinTing",
  url: officialSiteHref(),
  inLanguage: ["zh-CN", "en"],
  publisher: {
    "@type": "Organization",
    name: "DuolinTing",
  },
};
