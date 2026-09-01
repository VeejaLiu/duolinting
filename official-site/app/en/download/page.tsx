import type { Metadata } from "next";
import DownloadPage from "../../download/page";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Download DuolinTing | English Listening Practice + Android APK",
  description: "Start intensive and extensive listening practice on the web, and find official Android APK release and verification details here.",
  alternates: localizedAlternates("/download", "en"),
  openGraph: {
    title: "Download DuolinTing | English Listening Practice + Android APK",
    description: "Start intensive and extensive listening practice on the web. Official Android APK release and verification details live here.",
    url: "/en/download",
    images: [{ url: "/og-download.png", width: 1200, height: 630, alt: "Download DuolinTing — web and Android" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Download DuolinTing | English Listening Practice + Android APK",
    description: "Start intensive and extensive listening practice on the web. Official Android APK release and verification details live here.",
    images: ["/og-download.png"],
  },
};

export default function EnglishDownloadPage() {
  return <DownloadPage initialLocale="en" />;
}
