import Image from "next/image";
import Link from "next/link";
import { blogPosts, blogPostPath, type Locale } from "../content/blog-posts";
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

function formatDate(iso: string, locale: Locale) {
  if (locale === "zh") return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${monthNames[(month ?? 1) - 1]} ${day}, ${year}`;
}

const ui = {
  zh: {
    home: "返回首页",
    eyebrow: "博客与教程",
    title: "把真实材料，练成真正的听力。",
    lead: "关于精听、泛听、听写和听力学习方法的文章，帮助你用真实内容持续进步。",
    read: "阅读文章",
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
    eyebrow: "Blog & guides",
    title: "Turn real material into real listening.",
    lead: "Articles on intensive listening, extensive listening, dictation, and listening methods to keep improving with real content.",
    read: "Read the article",
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

export function BlogIndex({ locale }: { locale: Locale }) {
  const text = ui[locale];
  const homePath = locale === "en" ? "/en" : "/";
  const downloadPath = locale === "en" ? "/en/download" : "/download";
  const contributePath = locale === "en" ? "/en/contribute" : "/contribute";
  const privacyPath = locale === "en" ? "/en/privacy" : "/privacy";
  const termsPath = locale === "en" ? "/en/terms" : "/terms";
  const supportPath = locale === "en" ? "/en/support" : "/support";
  const languagePath = locale === "en" ? "/blog" : "/en/blog";

  return (
    <main className="blog-page" lang={locale === "zh" ? "zh-CN" : "en"}>
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

      <section className="landing-hero">
        <div className="site-shell landing-hero-copy">
          <p className="eyebrow"><span></span>{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="hero-description">{text.lead}</p>
        </div>
      </section>

      <div className="site-shell blog-index-list">
        {blogPosts.map((post) => {
          const t = post.locales[locale];
          return (
            <Link className="blog-index-card" key={post.slug} href={blogPostPath(post.slug, locale)}>
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
              <h2>{t.title}</h2>
              <p>{t.lead}</p>
              <span>{text.read} <i aria-hidden="true">→</i></span>
            </Link>
          );
        })}
      </div>

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
