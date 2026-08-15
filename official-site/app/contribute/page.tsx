import type { Metadata } from "next";
import { ContributeGuide } from "./contribute-guide";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "贡献指南",
  description: "了解如何用拥有使用权的真实媒体，在 DuolinTing 后台制作、检查、发布并维护一门逐句听力课。",
  alternates: localizedAlternates("/contribute"),
  openGraph: {
    title: "贡献指南｜DuolinTing 多邻听",
    description: "用你有权使用的真实媒体，制作一门能反复练的逐句听力课。",
    url: "/contribute",
    images: [{ url: "/admin-course-workbench.png", width: 1800, height: 1328, alt: "DuolinTing 制课工作台" }],
  },
  twitter: {
    title: "贡献指南｜DuolinTing 多邻听",
    description: "用你有权使用的真实媒体，制作一门能反复练的逐句听力课。",
    images: ["/admin-course-workbench.png"],
  },
};

export default function ContributePage() {
  return <ContributeGuide />;
}
