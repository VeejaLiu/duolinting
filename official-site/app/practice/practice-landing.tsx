import Image from "next/image";
import Link from "next/link";
import { learnerWebUrl } from "../content/learner-web";
import {
  landingPages,
  landingPagePath,
  type LandingPage,
  type Locale,
} from "../content/landing-pages";
import { officialSiteHref } from "../content/site-url";
import { StructuredData } from "../components/structured-data";
import { GitHubMark } from "../components/github-mark";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Render the "last updated" date in a locale-friendly shape. The data file
 * keeps a single ISO date per page; the Chinese copy stays ISO while the
 * English copy expands it for readability.
 */
function formatLastModified(iso: string, locale: Locale) {
  if (locale === "zh") return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${monthNames[(month ?? 1) - 1]} ${day}, ${year}`;
}

const copy = {
  zh: {
    home: "返回首页",
    webAction: "网页立即体验",
    webUnavailable: "网页端地址正在配置中",
    apkAction: "下载 Android APK",
    relatedEyebrow: "更多练习方式",
    relatedTitle: "继续了解 DuolinTing 的练习路径。",
    faqEyebrow: "常见问题",
    faqTitle: "你可能还想知道。",
    breadcrumbCurrent: "练习方式",
    footer: {
      download: "下载",
      blog: "博客",
      contribute: "贡献指南",
      privacy: "隐私",
      terms: "使用条款",
      support: "支持与联系",
      source: "GitHub",
      statement:
        "DuolinTing 是受 YouZack 听力学习理念启发的独立开源项目，并非 YouZack 官方产品，也不代表获得其官方背书。",
    },
  },
  en: {
    home: "Back to home",
    webAction: "Try the web app",
    webUnavailable: "The web address is being configured",
    apkAction: "Download Android APK",
    relatedEyebrow: "More ways to practice",
    relatedTitle: "Keep exploring DuolinTing's practice path.",
    faqEyebrow: "FAQ",
    faqTitle: "A few things you may still be wondering.",
    breadcrumbCurrent: "Practice",
    footer: {
      download: "Download",
      blog: "Blog",
      contribute: "Contribution guide",
      privacy: "Privacy",
      terms: "Terms",
      support: "Support",
      source: "GitHub",
      statement:
        "DuolinTing is an independent open-source project inspired by YouZack’s approach to listening practice. It is not an official YouZack product and is not endorsed by YouZack.",
    },
  },
} as const;

export function PracticeLanding({ page, locale }: { page: LandingPage; locale: Locale }) {
  const t = page.locales[locale];
  const ui = copy[locale];
  const path = landingPagePath(page.slug, locale);
  const homePath = locale === "en" ? "/en" : "/";
  const downloadPath = locale === "en" ? "/en/download" : "/download";
  const contributePath = locale === "en" ? "/en/contribute" : "/contribute";
  const privacyPath = locale === "en" ? "/en/privacy" : "/privacy";
  const termsPath = locale === "en" ? "/en/terms" : "/terms";
  const supportPath = locale === "en" ? "/en/support" : "/support";
  const blogPath = locale === "en" ? "/en/blog" : "/blog";
  const languagePath = locale === "en" ? path.replace(/^\/en/, "") : `/en${path}`;
  const siblings = landingPages.filter((p) => p.slug !== page.slug);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "DuolinTing", item: officialSiteHref(homePath) },
      { "@type": "ListItem", position: 2, name: t.hero.title, item: officialSiteHref(path) },
    ],
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: t.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="landing-page" lang={locale === "zh" ? "zh-CN" : "en"}>
      <StructuredData value={breadcrumbSchema} />
      <StructuredData value={faqSchema} />

      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href={homePath} aria-label="DuolinTing home">
            <Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} priority />
            <span><strong>DuolinTing</strong><small>多邻听</small></span>
          </Link>
          <div className="header-actions">
            <Link className="language-switch" href={languagePath}>{locale === "zh" ? "EN" : "中文"}</Link>
            <a className="header-source" href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer"><GitHubMark /> GitHub</a>
            <Link className="header-cta" href={homePath}>{ui.home}</Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="site-shell landing-hero-copy">
          <p className="eyebrow"><span></span>{t.hero.eyebrow}</p>
          <h1>{t.hero.title}</h1>
          <p className="hero-description">{t.hero.lead}</p>
          <div className="hero-actions">
            {learnerWebUrl ? (
              <a className="button button-primary" href={learnerWebUrl} target="_blank" rel="noreferrer">{ui.webAction}<span className="external-link-icon" aria-hidden="true">↗</span></a>
            ) : (
              <button className="button button-primary" type="button" disabled>{ui.webUnavailable}</button>
            )}
            <Link className="button button-secondary" href={downloadPath}>{ui.apkAction}</Link>
          </div>
          <p className="landing-updated">
            {locale === "zh" ? "最后更新：" : "Last updated: "}
            <time dateTime={page.lastModified}>{formatLastModified(page.lastModified, locale)}</time>
          </p>
        </div>
      </section>

      <div className="site-shell landing-body">
        <nav className="landing-breadcrumb" aria-label="Breadcrumb">
          <Link href={homePath}>DuolinTing</Link><span>/</span><span>{ui.breadcrumbCurrent}</span><span>/</span><span>{t.hero.title}</span>
        </nav>

        {t.sections.map((section) => (
          <section className="landing-section" key={section.title}>
            <p className="eyebrow"><span></span>{section.eyebrow}</p>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            {section.bullets && (
              <ul className="landing-bullets">
                {section.bullets.map((bullet) => <li key={bullet}><span>✓</span>{bullet}</li>)}
              </ul>
            )}
          </section>
        ))}

        <section className="landing-related">
          <p className="eyebrow"><span></span>{ui.relatedEyebrow}</p>
          <h2>{ui.relatedTitle}</h2>
          <div className="landing-related-grid">
            {siblings.map((sibling) => {
              const s = sibling.locales[locale];
              return (
                <Link className="landing-related-card" key={sibling.slug} href={landingPagePath(sibling.slug, locale)}>
                  <span>{s.hero.eyebrow}</span>
                  <strong>{s.hero.title}</strong>
                  <small aria-hidden="true">→</small>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="landing-faq">
          <div className="landing-faq-heading">
            <p className="eyebrow"><span></span>{ui.faqEyebrow}</p>
            <h2>{ui.faqTitle}</h2>
          </div>
          <div className="landing-faq-list">
            {t.faq.map((item) => (
              <details key={item.question}>
                <summary><strong>{item.question}</strong><span aria-hidden="true">+</span></summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <div className="site-shell">
          <div className="footer-top">
            <Link className="brand" href={homePath}>
              <Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} />
              <span><strong>DuolinTing</strong><small>多邻听</small></span>
            </Link>
            <nav>
              <Link href={downloadPath}>{ui.footer.download}</Link>
              <Link href={blogPath}>{ui.footer.blog}</Link>
              <Link href={contributePath}>{ui.footer.contribute}</Link>
              <Link href={privacyPath}>{ui.footer.privacy}</Link>
              <Link href={termsPath}>{ui.footer.terms}</Link>
              <Link href={supportPath}>{ui.footer.support}</Link>
              <a href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">{ui.footer.source}</a>
            </nav>
          </div>
          <p>{ui.footer.statement}</p>
        </div>
      </footer>
    </main>
  );
}
