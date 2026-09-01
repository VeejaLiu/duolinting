import type { Metadata } from "next";
import { localizedAlternates } from "../content/site-url";
import { BlogIndex } from "./blog-index";

export const metadata: Metadata = {
  title: "博客｜精听方法与听力练习",
  description: "关于精听、泛听、听写和听力学习方法的文章，帮助你用真实音频和视频持续提升英语听力。",
  alternates: localizedAlternates("/blog"),
  openGraph: {
    title: "博客｜精听方法与听力练习",
    description: "关于精听、泛听、听写和听力学习方法的文章，用真实材料持续提升听力。",
    url: "/blog",
    images: [{ url: "/og-home.png", width: 1200, height: 630, alt: "DuolinTing 多邻听——博客与教程" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "博客｜精听方法与听力练习",
    description: "关于精听、泛听、听写和听力学习方法的文章。",
    images: ["/og-home.png"],
  },
};

export default function BlogPage() {
  return <BlogIndex locale="zh" />;
}
