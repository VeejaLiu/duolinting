import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLandingPage, landingPages, landingPagePath } from "../../../content/landing-pages";
import { localizedAlternates } from "../../../content/site-url";
import { PracticeLanding } from "../../../practice/practice-landing";

/**
 * Static English feature-landing routes (`/en/practice/<slug>`), mirroring the
 * Chinese routes so each language has a separately indexable URL.
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

  const t = page.locales.en;
  const path = landingPagePath(slug, "zh");

  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: localizedAlternates(path, "en"),
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "DuolinTing",
      title: t.ogTitle,
      description: t.ogDescription,
      url: landingPagePath(slug, "en"),
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

export default async function EnglishPracticePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getLandingPage(slug);
  if (!page) notFound();

  return <PracticeLanding page={page} locale="en" />;
}
