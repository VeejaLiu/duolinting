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
  sameAs: ["https://github.com/VeejaLiu/duolinting"],
};

export const softwareApplicationSchema: JsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DuolinTing",
  alternateName: "多邻听",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web, Android",
  url: officialSiteHref(),
  image: officialSiteHref("/learner-web.png"),
  description: "Practice listening with real audio and video through warm-up listening, line-by-line practice, and difficult-line review.",
  inLanguage: ["zh-CN", "en"],
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
