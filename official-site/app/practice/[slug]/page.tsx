import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLandingPage, landingPages, landingPagePath } from "../../content/landing-pages";
import { localizedAlternates } from "../../content/site-url";
import { PracticeLanding } from "../practice-landing";

/**
 * Static Chinese feature-landing routes (`/practice/<slug>`). The slugs are
 * enumerated at build time from the content data file so each page gets its
 * own prerendered HTML, canonical, and hreflang.
 */
export function generateStaticParams() {
  return landingPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getLandingPage(slug);
  if (!page) return {};

  const t = page.locales.zh;
  const path = landingPagePath(slug, "zh");

  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: localizedAlternates(path, "zh"),
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "DuolinTing 多邻听",
      title: t.ogTitle,
      description: t.ogDescription,
      url: path,
      images: [{ url: page.ogImage, width: 1200, height: 630, alt: t.ogAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: t.ogTitle,
      description: t.ogDescription,
      images: [page.ogImage],
    },
  };
}

export default async function PracticePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getLandingPage(slug);
  if (!page) notFound();

  return <PracticeLanding page={page} locale="zh" />;
}
