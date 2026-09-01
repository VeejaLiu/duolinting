import type { Metadata } from "next";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "下载 DuolinTing 多邻听｜网页精听练习 + Android APK",
  description: "在网页开始逐句精听与泛听练习，并在 DuolinTing 官方下载页查看 Android APK 的发布、校验与安装说明。",
  alternates: localizedAlternates("/download"),
  openGraph: {
    title: "下载 DuolinTing 多邻听｜网页精听练习 + Android APK",
    description: "从网页开始逐句精听与泛听练习；Android APK 发布、校验与安装信息只在官网提供。",
    url: "/download",
    images: [{ url: "/og-download.png", width: 1200, height: 630, alt: "DuolinTing 多邻听下载——网页与 Android" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "下载 DuolinTing 多邻听｜网页精听练习 + Android APK",
    description: "从网页开始逐句精听与泛听练习；Android APK 发布、校验与安装信息只在官网提供。",
    images: ["/og-download.png"],
  },
};

export default function DownloadLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
