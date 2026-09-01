import Image from "next/image";
import Link from "next/link";
import { learnerWebUrl } from "../content/learner-web";
import {
  blogPosts,
  blogPostPath,
  type BlogPost,
  type Locale,
} from "../content/blog-posts";
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

/** Expand an ISO date for English readers; keep ISO for Chinese. */
function formatDate(iso: string, locale: Locale) {
  if (locale === "zh") return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${monthNames[(month ?? 1) - 1]} ${day}, ${year}`;
}

const ui = {
  zh: {
    home: "返回首页",
    webAction: "网页立即体验",
    webUnavailable: "网页端地址正在配置中",
    apkAction: "下载 Android APK",
    breadcrumb: "博客",
    published: "发布于",
    updated: "更新于",
    related: "继续阅读",
    footer: {
      download: "下载",
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
    breadcrumb: "Blog",
    published: "Published",
    updated: "Updated",
    related: "Keep reading",
    footer: {
      download: "Download",
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

export function BlogPostView({ post, locale }: { post: BlogPost; locale: Locale }) {
  const t = post.locales[locale];
  const text = ui[locale];
  const path = blogPostPath(post.slug, locale);
  const homePath = locale === "en" ? "/en" : "/";
  const blogIndexPath = locale === "en" ? "/en/blog" : "/blog";
  const downloadPath = locale === "en" ? "/en/download" : "/download";
  const contributePath = locale === "en" ? "/en/contribute" : "/contribute";
  const privacyPath = locale === "en" ? "/en/privacy" : "/privacy";
  const termsPath = locale === "en" ? "/en/terms" : "/terms";
  const supportPath = locale === "en" ? "/en/support" : "/support";
  const languagePath = locale === "en" ? path.replace(/^\/en/, "") : `/en${path}`;
  const siblings = blogPosts.filter((p) => p.slug !== post.slug);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: t.title,
    description: t.metaDescription,
    datePublished: post.publishedAt,
    dateModified: post.lastModified,
    mainEntityOfPage: officialSiteHref(path),
    inLanguage: locale === "zh" ? "zh-CN" : "en",
    image: officialSiteHref(post.ogImage),
    author: { "@type": "Organization", name: "DuolinTing" },
    publisher: {
      "@type": "Organization",
      name: "DuolinTing",
      logo: { "@type": "ImageObject", url: officialSiteHref("/duolinting-logo-ear.png") },
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "DuolinTing", item: officialSiteHref(homePath) },
      { "@type": "ListItem", position: 2, name: text.breadcrumb, item: officialSiteHref(blogIndexPath) },
      { "@type": "ListItem", position: 3, name: t.title, item: officialSiteHref(path) },
    ],
  };

  return (
    <main className="blog-page" lang={locale === "zh" ? "zh-CN" : "en"}>
      <StructuredData value={articleSchema} />
      <StructuredData value={breadcrumbSchema} />

      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href={homePath} aria-label="DuolinTing home">
            <Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} priority />
            <span><strong>DuolinTing</strong><small>多邻听</small></span>
          </Link>
          <div className="header-actions">
            <Link className="language-switch" href={languagePath}>{locale === "zh" ? "EN" : "中文"}</Link>
            <a className="header-source" href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer"><GitHubMark /> GitHub</a>
            <Link className="header-cta" href={homePath}>{text.home}</Link>
          </div>
        </div>
      </header>

      <article className="site-shell blog-article">
        <nav className="landing-breadcrumb" aria-label="Breadcrumb">
          <Link href={homePath}>DuolinTing</Link><span>/</span><Link href={blogIndexPath}>{text.breadcrumb}</Link><span>/</span><span>{t.title}</span>
        </nav>

        <header className="blog-header">
          <h1>{t.title}</h1>
          <p className="blog-lead">{t.lead}</p>
          <p className="blog-meta">
            {text.published} <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
            {" · "}{text.updated} <time dateTime={post.lastModified}>{formatDate(post.lastModified, locale)}</time>
          </p>
        </header>

        <div className="blog-body">
          {t.sections.map((section) => (
            <section className="blog-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets && (
                <ul className="landing-bullets">
                  {section.bullets.map((bullet) => <li key={bullet}><span>✓</span>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <aside className="blog-cta">
          <div>
            <h2>{locale === "zh" ? "开始你的逐句精听" : "Start your line-by-line practice"}</h2>
            <p>{locale === "zh" ? "打开网页端即可体验，无需安装。" : "Open the web learner - no install needed."}</p>
          </div>
          <div className="hero-actions">
            {learnerWebUrl ? (
              <a className="button button-primary" href={learnerWebUrl} target="_blank" rel="noreferrer">{text.webAction}<span className="external-link-icon" aria-hidden="true">↗</span></a>
            ) : (
              <button className="button button-primary" type="button" disabled>{text.webUnavailable}</button>
            )}
            <Link className="button button-secondary" href={downloadPath}>{text.apkAction}</Link>
          </div>
        </aside>

        {siblings.length > 0 && (
          <section className="landing-related">
            <p className="eyebrow"><span></span>{text.related}</p>
            <div className="landing-related-grid">
              {siblings.map((sibling) => {
                const s = sibling.locales[locale];
                return (
                  <Link className="landing-related-card" key={sibling.slug} href={blogPostPath(sibling.slug, locale)}>
                    <span>{text.breadcrumb}</span>
                    <strong>{s.title}</strong>
                    <small aria-hidden="true">→</small>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </article>

      <footer className="site-footer">
        <div className="site-shell">
          <div className="footer-top">
            <Link className="brand" href={homePath}>
              <Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} />
              <span><strong>DuolinTing</strong><small>多邻听</small></span>
            </Link>
            <nav>
              <Link href={downloadPath}>{text.footer.download}</Link>
              <Link href={contributePath}>{text.footer.contribute}</Link>
              <Link href={privacyPath}>{text.footer.privacy}</Link>
              <Link href={termsPath}>{text.footer.terms}</Link>
              <Link href={supportPath}>{text.footer.support}</Link>
              <a href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">{text.footer.source}</a>
            </nav>
          </div>
          <p>{text.footer.statement}</p>
        </div>
      </footer>
    </main>
  );
}
