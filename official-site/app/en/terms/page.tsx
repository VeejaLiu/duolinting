import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use and open-source licence information for DuolinTing.",
  alternates: localizedAlternates("/terms", "en"),
};

export default function EnglishTermsPage() {
  return <main className="legal-page" lang="en"><header className="site-header"><div className="site-shell header-inner"><Link className="brand" href="/en"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link><Link className="header-cta" href="/en">Back to home</Link></div></header><article className="site-shell legal-content"><p className="eyebrow"><span></span>Terms</p><h1>Respect content rights, and respect learners.</h1><p className="legal-updated">Last updated: August 15, 2026</p><h2>Product use</h2><p>DuolinTing organizes real audio and video for listening practice and lesson creation. Follow applicable laws, and make sure you have the necessary rights or permissions for every media file, subtitle, cover image, translation, or other material you upload, import, publish, or share.</p><h2>Content sources</h2><p>The project does not scrape or copy companion subtitles curated by YouZack. DuolinTing is an independent open-source project inspired by its listening-practice approach; it is not an official YouZack product and is not endorsed by YouZack.</p><h2>Open-source licence</h2><p>DuolinTing source code is available under Apache-2.0. When using, modifying, or distributing source code, follow the licence file and notice requirements in the repository.</p><h2>Information to add before public launch</h2><p>Before a formal public release, add the operating entity, contact channel, applicable law, and dispute-resolution terms. This page is a first-version product notice and does not replace legal advice.</p></article></main>;
}
