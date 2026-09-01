import type { Metadata } from "next";
import Home from "../page";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "DuolinTing | English Listening Practice: Intensive & Extensive",
  description: "Practice English listening with real audio and video: warm up with extensive listening, practice line by line, and review difficult lines. An open-source listening tool.",
  alternates: localizedAlternates("/", "en"),
  openGraph: {
    title: "DuolinTing | English Listening Practice, Line by Line",
    description: "Turn real-world audio and video into intensive and extensive listening practice you can understand, line by line.",
    url: "/en",
    images: [{ url: "/og-home.png", width: 1200, height: 630, alt: "DuolinTing — English listening practice" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DuolinTing | English Listening Practice, Line by Line",
    description: "Turn real-world audio and video into intensive and extensive listening practice you can understand, line by line.",
    images: ["/og-home.png"],
  },
};

export default function EnglishHomePage() {
  return <Home initialLocale="en" />;
}
