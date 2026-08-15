import type { Metadata } from "next";
import { ContributeGuide } from "../../contribute/contribute-guide";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Contribution guide",
  description: "Learn how to turn rights-cleared real media into a DuolinTing listening lesson, from the admin workspace through publication and maintenance.",
  alternates: localizedAlternates("/contribute", "en"),
  openGraph: {
    title: "Contribution guide | DuolinTing",
    description: "Turn real media you have the right to use into a listening lesson worth repeating.",
    url: "/en/contribute",
    images: [{ url: "/admin-course-workbench.png", width: 1800, height: 1328, alt: "DuolinTing creation workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contribution guide | DuolinTing",
    description: "Turn real media you have the right to use into a listening lesson worth repeating.",
    images: ["/admin-course-workbench.png"],
  },
};

export default function EnglishContributePage() {
  return <ContributeGuide initialLocale="en" />;
}
