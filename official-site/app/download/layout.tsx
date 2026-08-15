import type { Metadata } from "next";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "下载 DuolinTing",
  description: "在网页开始逐句听力练习，并在 DuolinTing 官方下载页查看 Android APK 的发布、校验与安装说明。",
  alternates: localizedAlternates("/download"),
  openGraph: {
    title: "下载 DuolinTing｜网页学习与 Android APK",
    description: "从网页开始逐句听力练习；Android APK 发布、校验与安装信息只在官网提供。",
    url: "/download",
    images: [{ url: "/learner-web.png", width: 1800, height: 929, alt: "DuolinTing 网页学习端" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "下载 DuolinTing｜网页学习与 Android APK",
    description: "从网页开始逐句听力练习；Android APK 发布、校验与安装信息只在官网提供。",
    images: ["/learner-web.png"],
  },
};

export default function DownloadLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
