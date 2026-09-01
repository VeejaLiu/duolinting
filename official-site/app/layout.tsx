import type { Metadata } from "next";
import "./globals.css";
import { officialSiteUrl } from "./content/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(officialSiteUrl),
  title: {
    default: "DuolinTing 多邻听｜精听与泛听练习，逐句听懂真实音频",
    template: "%s｜DuolinTing 多邻听",
  },
  description:
    "DuolinTing 多邻听：用真实音频和视频进行泛听、逐句精听与难点复习的英语听力练习工具。开源、可自部署。",
  icons: {
    icon: "/duolinting-logo-ear.png",
    shortcut: "/duolinting-logo-ear.png",
  },
  alternates: {
    canonical: "/",
    languages: {
      "zh-CN": "/",
      en: "/en",
      "x-default": "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "DuolinTing 多邻听",
    url: "/",
    title: "DuolinTing 多邻听｜精听与泛听练习，逐句听懂真实音频",
    description:
      "用真实音频和视频进行泛听、逐句精听与难点复习的英语听力练习工具。开源、可自部署。",
    images: [{ url: "/og-home.png", width: 1200, height: 630, alt: "DuolinTing 多邻听——精听与泛听练习" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DuolinTing 多邻听｜精听与泛听练习，逐句听懂真实音频",
    description: "用真实音频和视频进行泛听、逐句精听与难点复习的英语听力练习工具。",
    images: ["/og-home.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
