import type { Metadata } from "next";
import { ContributeGuide } from "./contribute-guide";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "贡献指南｜如何制作逐句精听课程",
  description: "了解如何用拥有使用权的真实媒体，在 DuolinTing 后台制作、检查、发布并维护一门逐句精听课程。",
  alternates: localizedAlternates("/contribute"),
  openGraph: {
    title: "贡献指南｜如何制作逐句精听课程",
    description: "用你有权使用的真实媒体，制作一门能反复练的逐句精听课程。",
    url: "/contribute",
    images: [{ url: "/og-contribute.png", width: 1200, height: 630, alt: "DuolinTing 贡献指南——制作逐句精听课程" }],
  },
  twitter: {
    title: "贡献指南｜如何制作逐句精听课程",
    description: "用你有权使用的真实媒体，制作一门能反复练的逐句精听课程。",
    images: ["/og-contribute.png"],
  },
};

export default function ContributePage() {
  return <ContributeGuide />;
}
