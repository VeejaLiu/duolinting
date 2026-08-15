import type { Metadata } from "next";
import "./globals.css";
import { officialSiteUrl } from "./content/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(officialSiteUrl),
  title: {
    default: "DuolinTing 多邻听｜把真实材料变成逐句听懂的练习",
    template: "%s｜DuolinTing 多邻听",
  },
  description:
    "用真实音频和视频进行泛听、逐句精听与难点复习。DuolinTing 是一套开源的语言听力学习与制课工具。",
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
    title: "DuolinTing 多邻听｜把真实材料变成逐句听懂的练习",
    description:
      "用真实音频和视频进行泛听、逐句精听与难点复习。DuolinTing 是一套开源的语言听力学习与制课工具。",
    images: [{ url: "/learner-web.png", width: 1800, height: 929, alt: "DuolinTing 网页学习端" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DuolinTing 多邻听｜把真实材料变成逐句听懂的练习",
    description: "用真实音频和视频进行泛听、逐句精听与难点复习。",
    images: ["/learner-web.png"],
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
