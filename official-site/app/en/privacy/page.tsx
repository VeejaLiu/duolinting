import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy information for the DuolinTing website and product.",
  alternates: localizedAlternates("/privacy", "en"),
};

export default function EnglishPrivacyPage() {
  return <main className="legal-page" lang="en"><header className="site-header"><div className="site-shell header-inner"><Link className="brand" href="/en"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link><Link className="header-cta" href="/en">Back to home</Link></div></header><article className="site-shell legal-content"><p className="eyebrow"><span></span>Privacy</p><h1>We process only the data needed to make the product work.</h1><p className="legal-updated">Last updated: August 15, 2026</p><h2>Website</h2><p>The website introduces DuolinTing, provides download information, and links to the product. It does not require an account by default. If analytics or forms are added later, this notice will be updated before launch to explain their purpose.</p><h2>Learning product</h2><p>Registration and sign-in process account identity information. To provide the learning experience, the product stores course progress, line mastery status, repeat count, dictation, notes, and vocabulary. These data are isolated by signed-in user. Administrators and learners use separate sessions and permissions.</p><h2>Downloads and security</h2><p>Android APKs are published only through official HTTPS download addresses. The download page provides the version and SHA-256 checksum so users can verify file integrity. The website never asks users to disable system-wide security protection.</p><h2>Information to add before public launch</h2><p>Before a formal public release, add the operating entity, privacy contact, data-retention period, and applicable regional requirements. This page explains the current product state and is not legal advice for a particular jurisdiction.</p></article></main>;
}
