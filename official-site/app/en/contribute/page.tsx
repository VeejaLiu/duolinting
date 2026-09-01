import type { Metadata } from "next";
import { ContributeGuide } from "../../contribute/contribute-guide";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Contribution Guide | Create Line-by-Line Listening Lessons",
  description: "Learn how to turn rights-cleared real media into a line-by-line listening lesson, from the admin workspace through publication and maintenance.",
  alternates: localizedAlternates("/contribute", "en"),
  openGraph: {
    title: "Contribution Guide | Create Line-by-Line Listening Lessons",
    description: "Turn real media you have the right to use into a line-by-line listening lesson worth repeating.",
    url: "/en/contribute",
    images: [{ url: "/og-contribute.png", width: 1200, height: 630, alt: "DuolinTing contribution guide — create line-by-line lessons" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contribution Guide | Create Line-by-Line Listening Lessons",
    description: "Turn real media you have the right to use into a line-by-line listening lesson worth repeating.",
    images: ["/og-contribute.png"],
  },
};

export default function EnglishContributePage() {
  return <ContributeGuide initialLocale="en" />;
}
