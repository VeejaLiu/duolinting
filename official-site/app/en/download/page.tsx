import type { Metadata } from "next";
import DownloadPage from "../../download/page";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Download DuolinTing",
  description: "Start line-by-line listening practice on the web and find official Android APK release and verification details here.",
  alternates: localizedAlternates("/download", "en"),
  openGraph: {
    title: "Download DuolinTing | Web learner and Android APK",
    description: "Start on the web. Official Android APK release and verification details live here.",
    url: "/en/download",
    images: [{ url: "/learner-web.png", width: 1800, height: 929, alt: "DuolinTing web learner" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Download DuolinTing | Web learner and Android APK",
    description: "Start on the web. Official Android APK release and verification details live here.",
    images: ["/learner-web.png"],
  },
};

export default function EnglishDownloadPage() {
  return <DownloadPage initialLocale="en" />;
}
