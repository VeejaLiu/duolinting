import type { Metadata } from "next";
import { localizedAlternates } from "../../content/site-url";
import { BlogIndex } from "../../blog/blog-index";

export const metadata: Metadata = {
  title: "Blog | Listening Practice & Methods",
  description: "Articles on intensive listening, extensive listening, dictation, and listening methods to keep improving your English listening with real audio and video.",
  alternates: localizedAlternates("/blog", "en"),
  openGraph: {
    title: "Blog | Listening Practice & Methods",
    description: "Articles on intensive listening, extensive listening, dictation, and listening methods.",
    url: "/en/blog",
    images: [{ url: "/og-home.png", width: 1200, height: 630, alt: "DuolinTing - blog and guides" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | Listening Practice & Methods",
    description: "Articles on intensive listening, extensive listening, dictation, and listening methods.",
    images: ["/og-home.png"],
  },
};

export default function EnglishBlogPage() {
  return <BlogIndex locale="en" />;
}
