"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { learnerWebUrl } from "./content/learner-web";
import { organizationSchema, softwareApplicationSchema, StructuredData, websiteSchema } from "./components/structured-data";

type Locale = "zh" | "en";

type Copy = {
  nav: { product: string; creators: string; download: string; openSource: string };
  hero: { eyebrow: string; titleStart: string; titleAccent: string; titleEnd: string; body: string; web: string; apk: string; note: string };
  practice: { eyebrow: string; title: string; body: string };
  stages: Array<{ number: string; title: string; body: string }>;
  learner: { eyebrow: string; title: string; body: string; bullets: string[] };
  creators: { eyebrow: string; title: string; body: string; steps: string[]; action: string };
  download: { eyebrow: string; title: string; body: string; web: string; apk: string; ios: string };
  source: { eyebrow: string; title: string; body: string; action: string; note: string };
  faq: { eyebrow: string; title: string; items: Array<{ question: string; answer: string }> };
  footer: { product: string; download: string; contribute: string; source: string; privacy: string; terms: string; statement: string };
};

const copy: Record<Locale, Copy> = {
  zh: {
    nav: { product: "产品", creators: "为创作者而设", download: "下载", openSource: "开源" },
    hero: {
      eyebrow: "真实材料，真正听懂",
      titleStart: "把真实世界的音频和视频，变成",
      titleAccent: "可以逐句听懂",
      titleEnd: "的语言练习。",
      body: "从整体理解开始，再逐句精听，把真正听不懂的部分留下来反复练习。用你关心的播客、访谈和新闻，练出听力的底气。",
      web: "网页立即体验",
      apk: "下载 Android APK",
      note: "无需安装即可体验 · Android 版可从官网获取",
    },
    practice: {
      eyebrow: "一套能坚持下去的练习路径",
      title: "听一遍、练一句、复习难点。",
      body: "不让“没听懂”一闪而过；每个阶段都为下一次真正理解服务。",
    },
    stages: [
      { number: "01", title: "泛听热身", body: "先完整听一遍，建立对主题、说话人与语境的整体认识。" },
      { number: "02", title: "逐句精听", body: "按时间轴练习每一句；先听、再判断、再核对。" },
      { number: "03", title: "难点复习", body: "集中练还不熟悉的句子，让时间花在真正需要的地方。" },
    ],
    learner: {
      eyebrow: "按你的节奏来",
      title: "每一句，都值得认真听懂。",
      body: "所有练习都围绕同一段真实材料展开。你可以控制播放、查看答案，也可以把真正难的部分留下来。",
      bullets: ["单句循环与播放速度", "字幕、翻译与听写", "难点标记、生词与笔记", "登录后延续跨端学习进度"],
    },
    creators: {
      eyebrow: "为真实内容而设的制课工具",
      title: "把一段媒体，做成一门能练的听力课。",
      body: "上传音频或视频，导入字幕，在波形上校准每句话的时间轴，补充翻译和课程信息，然后发布给学习者。",
      steps: ["上传媒体", "导入或编辑字幕", "校准句子时间轴", "发布课程"],
      action: "查看制课流程",
    },
    download: {
      eyebrow: "网页与移动端",
      title: "把逐句练习，带在身边。",
      body: "先在网页开始，或在 Android 手机上继续泛听、逐句精听和难点复习。",
      web: "网页立即体验",
      apk: "前往 Android 下载页",
      ios: "iOS 版正在准备中",
    },
    source: {
      eyebrow: "开放构建",
      title: "开放构建，也把学习数据留在自己手里。",
      body: "DuolinTing 以 Apache-2.0 开源。你可以参与改进、为自己的团队部署，也可以用自己的合法内容建立听力资料库。",
      action: "前往 GitHub",
      note: "独立开源项目 · Apache-2.0 License",
    },
    faq: {
      eyebrow: "常见问题",
      title: "开始之前，你可能想知道。",
      items: [
        { question: "我需要先下载 App 吗？", answer: "不需要。可以先在网页体验；Android 用户也可以从官方下载页安装 APK。" },
        { question: "APK 安全吗？", answer: "APK 只会从官网官方域名发布。下载页会提供版本、包名和 SHA-256，供你核对文件是否完整。" },
        { question: "我可以用自己的材料制作课程吗？", answer: "可以。管理后台支持上传媒体、导入常见字幕格式、校准逐句时间轴和发布课程。请确保你对媒体与字幕拥有合法使用权。" },
        { question: "可以自行部署吗？", answer: "可以。DuolinTing 以 Apache-2.0 开源；请通过 GitHub 仓库和部署文档开始。" },
      ],
    },
    footer: {
      product: "产品", download: "下载", contribute: "贡献指南", source: "GitHub", privacy: "隐私", terms: "使用条款",
      statement: "DuolinTing 是受 YouZack 听力学习理念启发的独立开源项目，并非 YouZack 官方产品，也不代表获得其官方背书。",
    },
  },
  en: {
    nav: { product: "Product", creators: "For creators", download: "Download", openSource: "Open source" },
    hero: {
      eyebrow: "Real content. Real understanding.",
      titleStart: "Turn real-world audio and video into practice you can",
      titleAccent: "understand, line by line",
      titleEnd: ".",
      body: "Start with the big picture, then listen closely line by line and return to the parts that still feel hard. Build confidence with the podcasts, interviews, and news you care about.",
      web: "Try on the web",
      apk: "Download Android APK",
      note: "No install needed to try it · Android is available from our website",
    },
    practice: {
      eyebrow: "A practice path you can keep going with",
      title: "Listen once. Practice a line. Review what is hard.",
      body: "Don’t let a missed line pass by; every stage helps you understand it the next time.",
    },
    stages: [
      { number: "01", title: "Warm up with the whole story", body: "Listen through once to understand the topic, speakers, and context." },
      { number: "02", title: "Listen closely, line by line", body: "Practice on the timeline: listen first, decide what you heard, then check." },
      { number: "03", title: "Review what still feels hard", body: "Focus on the lines you have not mastered, so your time goes where it matters." },
    ],
    learner: {
      eyebrow: "At your pace",
      title: "Every line is worth understanding.",
      body: "Every practice tool stays close to the same real material. Control playback, reveal answers when you are ready, and save the lines that need another pass.",
      bullets: ["Loop a line and change playback speed", "Subtitles, translations, and dictation", "Difficult lines, vocabulary, and notes", "Continue your progress across devices"],
    },
    creators: {
      eyebrow: "Made for real content",
      title: "Turn one piece of media into a listening lesson people can practice.",
      body: "Upload audio or video, import subtitles, align every line on a waveform, add translations and course details, then publish the lesson for learners.",
      steps: ["Upload media", "Import or edit subtitles", "Align line timing", "Publish a lesson"],
      action: "See the creation workflow",
    },
    download: {
      eyebrow: "Web and mobile",
      title: "Take line-by-line practice with you.",
      body: "Start on the web, or keep warming up, listening closely, and reviewing difficult lines on Android.",
      web: "Try on the web",
      apk: "Go to Android download",
      ios: "iOS is in preparation",
    },
    source: {
      eyebrow: "Built in the open",
      title: "Build in the open. Keep learning data in your hands.",
      body: "DuolinTing is open source under Apache-2.0. Help improve it, deploy it for your team, or build a listening library from media you have the right to use.",
      action: "View on GitHub",
      note: "Independent open-source project · Apache-2.0 License",
    },
    faq: {
      eyebrow: "FAQ",
      title: "A few things you may want to know first.",
      items: [
        { question: "Do I need to download the app first?", answer: "No. You can try DuolinTing on the web first. Android users can also install the APK from the official download page." },
        { question: "Is the APK safe?", answer: "APKs are published only through the official website. The download page provides the version, package name, and SHA-256 so you can verify the file is complete." },
        { question: "Can I create lessons from my own material?", answer: "Yes. The admin workspace supports media upload, common subtitle formats, line-level timing alignment, and publishing. Make sure you have the right to use the media and subtitles." },
        { question: "Can I self-host it?", answer: "Yes. DuolinTing is open source under Apache-2.0. Start with the GitHub repository and deployment documentation." },
      ],
    },
    footer: {
      product: "Product", download: "Download", contribute: "Contribution guide", source: "GitHub", privacy: "Privacy", terms: "Terms",
      statement: "DuolinTing is an independent open-source project inspired by YouZack’s approach to listening practice. It is not an official YouZack product and is not endorsed by YouZack.",
    },
  },
};

const release = { version: "0.1.0", build: "5", packageName: "com.duolinting.app" };

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home({ initialLocale = "zh" }: { initialLocale?: Locale }) {
  const [locale] = useState<Locale>(initialLocale);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const t = copy[locale];
  const languageLabel = locale === "zh" ? "EN" : "中文";
  const downloadPath = initialLocale === "en" ? "/en/download" : "/download";
  const contributePath = initialLocale === "en" ? "/en/contribute" : "/contribute";
  const languagePath = initialLocale === "en" ? "/" : "/en";

  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);

  const navigation = useMemo(() => [
    [t.nav.product, "product"], [t.nav.creators, "creators"], [t.nav.download, "download"], [t.nav.openSource, "open-source"],
  ], [t.nav]);

  return (
    <main lang={locale === "zh" ? "zh-CN" : "en"}>
      <StructuredData value={organizationSchema} />
      <StructuredData value={websiteSchema} />
      <StructuredData value={softwareApplicationSchema} />
      <StructuredData value={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: t.faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }} />
      <header className="site-header">
        <div className="site-shell header-inner">
          <button className="brand" type="button" onClick={() => scrollToSection("top")} aria-label="DuolinTing home">
            <Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} priority />
            <span><strong>DuolinTing</strong><small>多邻听</small></span>
          </button>
          <nav className={`primary-nav ${menuOpen ? "is-open" : ""}`} aria-label="Primary navigation">
            {navigation.map(([label, id]) => <button key={id} type="button" onClick={() => { scrollToSection(id); setMenuOpen(false); }}>{label}</button>)}
            <Link className="language-switch mobile-only" href={languagePath}>{languageLabel}</Link>
          </nav>
          <div className="header-actions">
            <Link className="language-switch desktop-only" href={languagePath}>{languageLabel}</Link>
            {learnerWebUrl ? <a className="header-cta" href={learnerWebUrl} target="_blank" rel="noreferrer">{t.hero.web}<span className="external-link-icon" aria-hidden="true">↗</span></a> : <button className="header-cta" type="button" disabled>{t.hero.web}</button>}
            <button className="menu-trigger" type="button" aria-expanded={menuOpen} aria-label="Toggle navigation menu" onClick={() => setMenuOpen(!menuOpen)}><span></span><span></span><span></span></button>
          </div>
        </div>
      </header>

      <section id="top" className="hero-section">
        <div className="site-shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span></span>{t.hero.eyebrow}</p>
            <h1>{t.hero.titleStart} <em>{t.hero.titleAccent}</em>{t.hero.titleEnd}</h1>
            <p className="hero-description">{t.hero.body}</p>
            <div className="hero-actions">{learnerWebUrl ? <a className="button button-primary" href={learnerWebUrl} target="_blank" rel="noreferrer">{t.hero.web}<span className="external-link-icon" aria-hidden="true">↗</span></a> : <button className="button button-primary" type="button" disabled>{t.hero.web}</button>}<Link className="button button-secondary" href={downloadPath}>{t.hero.apk}</Link></div>
            <p className="platform-note"><span>✓</span>{t.hero.note}</p>
          </div>
          <div className="hero-preview" aria-label="DuolinTing line-by-line listening practice preview">
            <div className="preview-toolbar"><div><span className="preview-dot"></span><strong>Morning conversations</strong></div><span>03 / 12</span></div>
            <div className="audio-wave" aria-hidden="true">{Array.from({ length: 48 }).map((_, index) => <i key={index} style={{ height: `${20 + ((index * 13) % 48)}%` }} />)}</div>
            <div className="audio-progress"><span></span><i></i></div>
            <p className="listen-prompt">{locale === "zh" ? "先听一遍，你听到了什么？" : "Listen once. What did you hear?"}</p>
            <div className="sentence-card"><strong>The street is still quiet.</strong><small>{locale === "zh" ? "街道仍然很安静。" : "Reveal the translation when you are ready."}</small></div>
            <div className="preview-controls"><button type="button" aria-label="Play preview">▶</button><span>0:12 – 0:16 · ×0.8 · {locale === "zh" ? "重复播放" : "Repeat"}</span></div>
            <div className="difficult-tip"><b>★</b>{locale === "zh" ? "标记为难点，稍后复习" : "Save for difficult review"}</div>
          </div>
        </div>
      </section>

      <section id="product" className="practice-section section-pad">
        <div className="site-shell"><div className="section-heading split-heading"><div><p className="eyebrow"><span></span>{t.practice.eyebrow}</p><h2>{t.practice.title}</h2></div><p>{t.practice.body}</p></div><div className="stage-grid">{t.stages.map((stage) => <article className="stage-card" key={stage.number}><span>{stage.number}</span><h3>{stage.title}</h3><p>{stage.body}</p></article>)}</div></div>
      </section>

      <section className="learner-section section-pad">
        <div className="site-shell feature-grid"><div className="web-shot-wrap"><Image src="/learner-web.png" alt={locale === "zh" ? "DuolinTing 网页学习端界面" : "DuolinTing web learner interface"} width={1800} height={929} sizes="(max-width: 900px) 100vw, 52vw" /><div className="browser-dots" aria-hidden="true"><i></i><i></i><i></i></div></div><div className="feature-copy"><p className="eyebrow"><span></span>{t.learner.eyebrow}</p><h2>{t.learner.title}</h2><p>{t.learner.body}</p><ul>{t.learner.bullets.map((bullet) => <li key={bullet}><span>✓</span>{bullet}</li>)}</ul></div></div>
      </section>

      <section id="creators" className="creator-section section-pad">
        <div className="site-shell creator-grid"><div className="creator-copy"><p className="eyebrow"><span></span>{t.creators.eyebrow}</p><h2>{t.creators.title}</h2><p>{t.creators.body}</p><ol>{t.creators.steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span>{index < t.creators.steps.length - 1 && <i aria-hidden="true">→</i>}</li>)}</ol><Link className="text-action" href={contributePath}>{t.creators.action} <span>→</span></Link></div><div className="admin-shot-wrap"><Image src="/admin-course-workbench.png" alt={locale === "zh" ? "DuolinTing 制课工作台的波形与字幕时间轴" : "DuolinTing creation workspace with waveform and subtitle timeline"} width={1800} height={1328} sizes="(max-width: 900px) 100vw, 52vw" /></div></div>
      </section>

      <section id="download" className="download-section section-pad">
        <div className="site-shell download-panel"><div className="download-phone"><Image src="/learner-mobile.png" alt={locale === "zh" ? "DuolinTing Android 移动端逐句精听界面" : "DuolinTing Android line-by-line practice interface"} width={556} height={1200} sizes="(max-width: 900px) 190px, 255px" /></div><div className="download-copy"><p className="eyebrow"><span></span>{t.download.eyebrow}</p><h2>{t.download.title}</h2><p>{t.download.body}</p><div className="download-actions">{learnerWebUrl ? <a className="button button-primary" href={learnerWebUrl} target="_blank" rel="noreferrer">{t.download.web}<span className="external-link-icon" aria-hidden="true">↗</span></a> : <button className="button button-primary" type="button" disabled>{t.download.web}</button>}<Link className="button button-secondary" href={downloadPath}>{t.download.apk}</Link></div><p className="ios-note"><span>●</span>{t.download.ios}</p></div><aside className="release-card" aria-label="Android release details"><div className="release-heading"><strong>DuolinTing for Android</strong><span>{locale === "zh" ? "官方发布" : "Official release"}</span></div><dl><div><dt>{locale === "zh" ? "当前版本" : "Current version"}</dt><dd>{release.version} · Build {release.build}</dd></div><div><dt>{locale === "zh" ? "Android 包名" : "Android package"}</dt><dd>{release.packageName}</dd></div><div><dt>{locale === "zh" ? "发行信息" : "Release details"}</dt><dd>{locale === "zh" ? "发布时显示日期与文件大小" : "Release details shown when published"}</dd></div><div><dt>SHA-256</dt><dd>{locale === "zh" ? "发布时显示最终校验值" : "Final checksum shown on release"}</dd></div></dl><Link className="apk-button" href={downloadPath}>{t.hero.apk}</Link><p><span>✓</span>HTTPS <span>✓</span>{locale === "zh" ? "签名版本" : "Signed release"} <span>✓</span>SHA-256</p></aside></div>
      </section>

      <section id="open-source" className="open-source-section section-pad">
        <div className="site-shell source-panel"><div><p className="eyebrow"><span></span>{t.source.eyebrow}</p><h2>{t.source.title}</h2><p>{t.source.body}</p><a className="button button-on-dark" href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">{t.source.action}</a></div><div className="source-mark" aria-hidden="true"><Image src="/duolinting-logo-ear.png" alt="" width={188} height={176} /><span>&lt;/&gt;</span></div><small>{t.source.note}</small></div>
      </section>

      <section className="faq-section section-pad"><div className="site-shell faq-layout"><div><p className="eyebrow"><span></span>{t.faq.eyebrow}</p><h2>{t.faq.title}</h2></div><div className="faq-list">{t.faq.items.map((item, index) => <article key={item.question} className={openFaq === index ? "open" : ""}><button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? null : index)}><strong>{item.question}</strong><span>+</span></button><div><p>{item.answer}</p></div></article>)}</div></div></section>

      <footer className="site-footer"><div className="site-shell"><div className="footer-top"><button className="brand" type="button" onClick={() => scrollToSection("top")}><Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} /><span><strong>DuolinTing</strong><small>多邻听</small></span></button><nav><button type="button" onClick={() => scrollToSection("product")}>{t.footer.product}</button><Link href={downloadPath}>{t.footer.download}</Link><Link href={contributePath}>{t.footer.contribute}</Link><a href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">{t.footer.source}</a><Link href="/privacy">{t.footer.privacy}</Link><Link href="/terms">{t.footer.terms}</Link></nav></div><p>{t.footer.statement}</p></div></footer>
    </main>
  );
}
