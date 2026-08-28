import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Support and Contact",
  description: "Installation, account, learning, and privacy support for DuolinTing.",
  alternates: localizedAlternates("/support", "en"),
};

export default function EnglishSupportPage() {
  return (
    <main className="legal-page" lang="en">
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/en"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <Link className="header-cta" href="/en">Back to home</Link>
        </div>
      </header>
      <article className="site-shell legal-content">
        <p className="eyebrow"><span></span>Support and contact</p>
        <h1>Need help? Contact us directly.</h1>
        <p className="legal-updated">Last updated: August 29, 2026</p>

        <h2>Operator</h2>
        <p>DuolinTing is an independent open-source project maintained by Veeja Liu as an individual developer.</p>

        <h2>Contact options</h2>
        <ul className="legal-list">
          <li><strong>Email:</strong> <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> (installation, sign-in, sync, account deletion, privacy, and feature feedback)</li>
          <li><strong>Phone / WeChat:</strong> <a href="tel:+8615352290342">+86 153 5229 0342</a> (same number on WeChat)</li>
          <li><strong>QQ:</strong> <span className="contact-value">1209898373</span></li>
          <li><strong>Discord:</strong> <a href="https://discord.com/users/924180303487066182" target="_blank" rel="noreferrer">DuolinTing maintainer</a></li>
          <li><strong>Source and issue reports:</strong> <a href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">GitHub repository</a></li>
        </ul>

        <h2>What we can help with</h2>
        <ul className="legal-list">
          <li>App installation, launch, registration, sign-in, and cross-device sync.</li>
          <li>Course playback, subtitles, translations, learning progress, and answer feedback.</li>
          <li>Account access, account deletion, data access, and privacy requests.</li>
          <li>Content sources, rights, and lesson-contribution questions.</li>
        </ul>

        <h2>What to include</h2>
        <p>Tell us which platform you use (iPhone, Android, or Web), the app version, the steps you took, and what happened. For account issues, the account email is enough. Do not send passwords, verification codes, payment details, or other unnecessary sensitive information.</p>

        <h2>Account deletion</h2>
        <p>Signed-in users can enter the current password under “Settings → Delete account” in the app. If you cannot sign in, email us to request deletion; we will verify the request before deleting the account and account-level learning data. See the <a href="/en/privacy">privacy policy</a> for details.</p>

        <p className="legal-links"><Link href="/en/privacy">Privacy policy</Link> · <Link href="/en/terms">Terms</Link> · <Link href="/en">Back to home</Link></p>
      </article>
    </main>
  );
}
