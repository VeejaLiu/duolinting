import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of use and open-source licence information for DuolinTing.",
  alternates: localizedAlternates("/terms", "en"),
};

export default function EnglishTermsPage() {
  return (
    <main className="legal-page" lang="en">
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/en"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <Link className="header-cta" href="/en">Back to home</Link>
        </div>
      </header>
      <article className="site-shell legal-content">
        <p className="eyebrow"><span></span>Terms of use</p>
        <h1>Respect content rights, and respect learners.</h1>
        <p className="legal-updated">Last updated: August 29, 2026</p>

        <h2>Operator and contact</h2>
        <p>DuolinTing is an independent open-source project maintained by Veeja Liu as an individual developer. For questions about these terms, service use, or content rights, email <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> or visit the <a href="/en/support">support page</a>.</p>

        <h2>Service and accounts</h2>
        <p>DuolinTing provides listening practice with real audio and video, course discovery, learning-progress synchronization, and content-creation tools. You may register an account on supported platforms. Provide accurate information, protect your password, and do not share your sign-in credentials.</p>

        <h2>Content rights and rules</h2>
        <ul className="legal-list">
          <li>Audio, video, subtitles, cover art, translations, and other material that you upload, import, publish, or share must be yours, licensed to you, or covered by an open licence that permits this use.</li>
          <li>Do not upload or distribute material that infringes copyright, trademark, privacy, or other rights, and do not bypass access restrictions set by content owners.</li>
          <li>Do not scrape, copy, or redistribute companion subtitles curated by YouZack. DuolinTing is an independent project inspired by its listening-practice approach, not an official YouZack product.</li>
          <li>Maintainers may restrict, hide, or remove content for safety, compliance, quality, or service-operation reasons.</li>
        </ul>

        <h2>Open-source licence</h2>
        <p>DuolinTing source code is available under Apache-2.0. When using, modifying, or distributing source code, follow the licence file and notice requirements in the repository. The open-source licence does not grant rights to third-party media, subtitles, or other content.</p>

        <h2>Learning data and account deletion</h2>
        <p>Learning progress, dictation, notes, vocabulary, and other account data are handled as described in the <a href="/en/privacy">privacy policy</a>. You can start deletion from “Settings → Delete account” in the app. If you cannot sign in, contact us through the <a href="/en/support">support page</a>. Deleting an account does not automatically delete public course content that you helped maintain, but it removes the link between the collaboration identity and the learner account.</p>

        <h2>Availability</h2>
        <p>We work to keep the service stable, but do not promise that it will be continuous, error-free, or always available. Maintainers may limit features temporarily for security, upgrades, repairs, or content review. Do not use the service as your only backup; keep copies of important personal content.</p>

        <h2>Feedback and suggestions</h2>
        <p>If you send questions, suggestions, or content feedback, you allow maintainers to use that information as needed to provide and improve the service. Do not include passwords, payment details, or other unnecessary sensitive information.</p>

        <h2>Changes and disputes</h2>
        <p>We will update the date on this page when these terms change. Continuing to use the service after an update means you have had an opportunity to review it. Service-related disputes should first be discussed through <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a>. If they cannot be resolved, they may be submitted to a court with jurisdiction, subject to any mandatory applicable law.</p>

        <p className="legal-links"><Link href="/en/privacy">Privacy policy</Link> · <Link href="/en/support">Support</Link> · <Link href="/en">Back to home</Link></p>
      </article>
    </main>
  );
}
