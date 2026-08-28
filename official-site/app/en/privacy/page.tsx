import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../../content/site-url";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for the DuolinTing website and learning product.",
  alternates: localizedAlternates("/privacy", "en"),
};

export default function EnglishPrivacyPage() {
  return (
    <main className="legal-page" lang="en">
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/en"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <Link className="header-cta" href="/en">Back to home</Link>
        </div>
      </header>
      <article className="site-shell legal-content">
        <p className="eyebrow"><span></span>Privacy policy</p>
        <h1>We process only the data needed to provide DuolinTing.</h1>
        <p className="legal-updated">Last updated: August 29, 2026</p>

        <h2>Operator and contact</h2>
        <p>DuolinTing is an independent open-source project maintained by Veeja Liu as an individual developer. For privacy questions, data requests, or account issues, contact <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> or visit the <a href="/en/support">support page</a> for other contact options.</p>

        <h2>Data we process</h2>
        <ul className="legal-list">
          <li><strong>Account information:</strong> the email address and display name used for registration and sign-in, plus a cryptographic password hash. We do not store passwords in plain text.</li>
          <li><strong>Learning data:</strong> course progress, line mastery, repeat counts, dictation, notes, vocabulary, learning preferences, daily activity, and answer feedback.</li>
          <li><strong>Session and security data:</strong> session-token hashes, client type, creation time, and expiry time, used to maintain sign-in, revoke sessions, and prevent abuse.</li>
          <li><strong>Operational logs:</strong> request ID, method and path, response status, duration, source address, and response size, used for security monitoring, troubleshooting, and service operations.</li>
        </ul>

        <h2>How we use data</h2>
        <p>Account information is used for registration, sign-in, and account display. Learning data is used to save and restore progress across devices. Session and operational data are used for authentication, rate limiting, security, and troubleshooting. We do not sell personal information or use advertising networks for targeted advertising.</p>

        <h2>Sharing and service providers</h2>
        <p>Data is processed in the servers, databases, object storage, and logging environments needed to operate the service. Access is limited to what is needed to maintain the service, fix incidents, and protect users. The website currently does not use advertising SDKs or third-party analytics SDKs. If we add a service that collects personal data, we will update this policy first to explain its purpose and scope.</p>

        <h2>Data retention</h2>
        <ul className="legal-list">
          <li>Account information and learning data are retained while the account exists so the service can provide sign-in and synchronization.</li>
          <li>Sign-in sessions expire or are removed when they expire, are revoked, or the account is deleted.</li>
          <li>Operational logs are not kept as a long-term learning profile. They are retained only for security and operational needs and are rotated or deleted according to the deployment environment’s policy.</li>
          <li>Records required by law are retained only for the required period and only to the extent needed to meet that obligation.</li>
        </ul>

        <h2>Account and data deletion</h2>
        <p>A signed-in user can open “Settings → Delete account” in the app, enter the current password, and start deletion. After a successful deletion, the account, sessions, course progress, line progress, vocabulary, notes, activity records, preferences, and answer feedback are deleted from the service. If the account is also linked to a content-collaboration identity, that link is removed; public course content maintained by that identity is not deleted.</p>
        <p>If you cannot sign in, contact us through the <a href="/en/support">support page</a> to request deletion. Do not send your password by email; we may ask you to confirm the account email and other information needed to verify the request.</p>

        <h2>Your choices</h2>
        <p>You may ask to access, correct, or delete data associated with your account, or ask questions about our privacy practices. Contact <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a>; we will process the request after verification.</p>

        <h2>Policy changes</h2>
        <p>If the way we process data changes materially, we will update the date and explanation on this page. Continued use of the service means you have had an opportunity to review the updated policy.</p>

        <p className="legal-links"><Link href="/en/support">Support</Link> · <Link href="/en/terms">Terms</Link> · <Link href="/en">Back to home</Link></p>
      </article>
    </main>
  );
}
