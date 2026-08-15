import type { Metadata } from "next";
import Home from "../page";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "Learn from real media, line by line",
  description: "Practice listening with real audio and video: understand the whole story, listen closely line by line, and review what is difficult.",
  alternates: localizedAlternates("/", "en"),
  openGraph: {
    title: "DuolinTing | Practice real listening, line by line",
    description: "Turn real-world audio and video into listening practice you can understand, line by line.",
    url: "/en",
    images: [{ url: "/learner-web.png", width: 1800, height: 929, alt: "DuolinTing web listening practice" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DuolinTing | Practice real listening, line by line",
    description: "Turn real-world audio and video into listening practice you can understand, line by line.",
    images: ["/learner-web.png"],
  },
};

export default function EnglishHomePage() {
  return <Home initialLocale="en" />;
}
