"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { androidRelease } from "../content/android-release";
import { learnerWebUrl } from "../content/learner-web";
import { softwareApplicationSchema, StructuredData } from "../components/structured-data";
import { GitHubMark } from "../components/github-mark";

type Locale = "zh" | "en";

const messages = {
  zh: {
    home: "返回首页",
    title: "听懂每一句，从现在开始。",
    lead: "在网页端开始泛听、逐句精听与难点复习。无需安装，打开即可学习。",
    webAction: "网页立即体验",
    webUnavailable: "网页端地址正在配置中",
    startNote: "现在可用 · 无需安装",
    scroll: "了解移动端",
    mobileEyebrow: "网页与移动端",
    mobileTitle: "从网页开始，学习自然延续。",
    mobileBody: "先在任意设备的浏览器中使用 DuolinTing。Android APK 与 iOS 版准备完成后，也会只在这个官方页面发布。",
    web: "网页学习端",
    webStatus: "现在可用",
    webMeta: "电脑和手机浏览器均可使用",
    android: "Android APK",
    androidStatusPreparing: "正在准备中",
    androidStatusAvailable: "现已可下载",
    androidMetaPreparing: "发布后提供官方 HTTPS 下载与完整核验信息",
    androidMetaAvailable: "官方 HTTPS 下载与文件核验信息",
    ios: "iOS",
    iosStatus: "准备中",
    iosMeta: "官方安装方式可用后在此更新",
    releaseEyebrow: "Android 发布中心",
    releasePreparingTitle: "Android APK 正在准备中。",
    releaseAvailableTitle: "获取 Android APK。",
    releasePreparingBody: "当前没有可下载的 APK，也无需调整手机的系统安全设置。首个官方文件准备好后，会直接在这里发布。",
    releaseAvailableBody: "只从本页官方域名下载。安装前请核对版本、文件大小、SHA-256 与签名证书指纹。",
    officialFilePreparing: "当前暂无可下载文件",
    officialFileReady: "官方文件已发布",
    releaseInfo: "发行与核验信息",
    plannedVersion: "计划首发版本",
    currentVersion: "当前版本",
    packageName: "Android 包名",
    releaseDate: "发布日期",
    fileSize: "文件大小",
    checksum: "APK SHA-256",
    certificateChecksum: "签名证书 SHA-256",
    releaseIncludes: ["官方 HTTPS 文件链接", "文件大小与 APK SHA-256", "签名证书 SHA-256、更新说明和历史版本"],
    releaseIncludesTitle: "发布时，本页会同步提供",
    download: "下载 Android APK",
    releaseNotes: "更新说明",
    installTitle: "安装 Android APK",
    installSteps: [
      ["下载官方 APK", "只从 DuolinTing 官方下载页获取文件。"],
      ["按系统提示安装", "仅为这次下载的应用授权浏览器或文件管理器安装。"],
      ["打开并继续学习", "登录后继续学习进度，或直接开始探索课程。"],
    ],
    safetyTitle: "每一份官方文件，都可以自己确认。",
    safetyBody: "由于应用暂未上架商店，Android 或 Play Protect 可能会显示非商店来源提示。这是系统的常规保护机制；请确认来源为本页官方域名，并核对 SHA-256。无需关闭系统级安全保护。",
    updatesTitle: "更新始终在同一个地方。",
    updatesBody: "新版本会在这个固定下载页发布，并保留版本化文件与更新说明，方便确认当前版本和历史记录。",
    contribute: "贡献指南",
  },
  en: {
    home: "Back to home",
    title: "Understand every line. Start now.",
    lead: "Warm up, listen closely line by line, and review difficult lines on the web. No installation needed—just open and learn.",
    webAction: "Try the web app",
    webUnavailable: "The web address is being configured",
    startNote: "Available now · No installation needed",
    scroll: "Explore mobile apps",
    mobileEyebrow: "Web and mobile",
    mobileTitle: "Start on the web. Let your learning follow naturally.",
    mobileBody: "Use DuolinTing in any browser today. The Android APK and iOS app will be published only through this official page when they are ready.",
    web: "Web learner",
    webStatus: "Available now",
    webMeta: "Works in desktop and mobile browsers",
    android: "Android APK",
    androidStatusPreparing: "In preparation",
    androidStatusAvailable: "Available now",
    androidMetaPreparing: "Official HTTPS download and verification details at release",
    androidMetaAvailable: "Official HTTPS download and file verification details",
    ios: "iOS",
    iosStatus: "In preparation",
    iosMeta: "Updated here when an official option is available",
    releaseEyebrow: "Android release center",
    releasePreparingTitle: "The Android APK is in preparation.",
    releaseAvailableTitle: "Get the Android APK.",
    releasePreparingBody: "There is no APK to download yet, and you do not need to change your phone’s system security settings. The first official file will be released right here when it is ready.",
    releaseAvailableBody: "Download only from this official domain. Before installing, check the version, file size, SHA-256, and signing-certificate fingerprint.",
    officialFilePreparing: "No file is available yet",
    officialFileReady: "Official file released",
    releaseInfo: "Release and verification",
    plannedVersion: "Planned first version",
    currentVersion: "Current version",
    packageName: "Android package",
    releaseDate: "Release date",
    fileSize: "File size",
    checksum: "APK SHA-256",
    certificateChecksum: "Signing certificate SHA-256",
    releaseIncludes: ["An official HTTPS file link", "File size and APK SHA-256", "Signing-certificate SHA-256, release notes, and history"],
    releaseIncludesTitle: "This page will include at release",
    download: "Download Android APK",
    releaseNotes: "Release notes",
    installTitle: "Install the Android APK",
    installSteps: [
      ["Download the official APK", "Get the file only from DuolinTing’s official download page."],
      ["Follow Android’s installation prompt", "Allow your browser or file manager to install only this downloaded app."],
      ["Open and keep learning", "Sign in to continue your progress, or start exploring courses right away."],
    ],
    safetyTitle: "Every official file can be verified by you.",
    safetyBody: "Because the app is not yet in an app store, Android or Play Protect may show a notice about apps from outside a store. This is a normal system safeguard. Confirm that the file came from this official domain and verify the SHA-256; you never need to disable system-wide security protection.",
    updatesTitle: "Updates stay in one place.",
    updatesBody: "New versions will appear on this stable download page with versioned files and release notes, making it easy to confirm the current release and its history.",
    contribute: "Contribution guide",
  },
} as const;

function valueOrFallback(value: string | null) {
  return value ?? "—";
}

export default function DownloadPage({ initialLocale = "zh" }: { initialLocale?: Locale }) {
  const [locale] = useState<Locale>(initialLocale);
  const t = messages[locale];
  const isAvailable = androidRelease.status === "published" && Boolean(androidRelease.downloadUrl);
  const releaseNotes = androidRelease.notes[locale];
  const languagePath = initialLocale === "en" ? "/download" : "/en/download";

  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);

  return (
    <main className="download-page chrome-inspired-download-page" lang={locale === "zh" ? "zh-CN" : "en"}>
      <StructuredData value={softwareApplicationSchema} />
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/" aria-label="DuolinTing home"><Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} priority /><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <div className="download-header-actions"><Link className="language-switch" href={languagePath}>{locale === "zh" ? "EN" : "中文"}</Link><a className="header-source" href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer"><GitHubMark /> GitHub</a><Link className="header-cta" href={initialLocale === "en" ? "/en" : "/"}>{t.home}</Link></div>
        </div>
      </header>

      <section className="download-hero chrome-hero">
        <div className="site-shell chrome-hero-copy">
          <Image className="chrome-hero-logo" src="/duolinting-logo-ear.png" alt="" width={104} height={100} priority />
          <h1>{t.title}</h1>
          <p>{t.lead}</p>
          {learnerWebUrl ? <a className="button button-primary chrome-primary-action" href={learnerWebUrl} target="_blank" rel="noreferrer">{t.webAction}<span className="external-link-icon" aria-hidden="true">↗</span></a> : <button className="chrome-primary-action" type="button" disabled>{t.webUnavailable}</button>}
          <p className="chrome-start-note"><span></span>{t.startNote}</p>
          <a className="chrome-scroll-link" href="#platforms">{t.scroll}<span aria-hidden="true">↓</span></a>
        </div>
        <div className="site-shell chrome-product-stage" aria-label={locale === "zh" ? "DuolinTing 网页与移动端学习界面" : "DuolinTing web and mobile learning interfaces"}>
          <div className="chrome-product-browser"><div className="chrome-browser-top"><i></i><i></i><i></i><span>DuolinTing · {t.web}</span></div><Image src="/learner-web.png" alt="" width={1800} height={930} sizes="(max-width: 1180px) 100vw, 1100px" priority /></div>
          <div className="chrome-product-phone"><Image src="/learner-mobile.png" alt="" width={556} height={1200} sizes="(max-width: 560px) 120px, 175px" /></div>
        </div>
      </section>

      <section className="platform-strip" id="platforms">
        <div className="site-shell">
          <header><p className="eyebrow"><span></span>{t.mobileEyebrow}</p><h2>{t.mobileTitle}</h2><p>{t.mobileBody}</p></header>
          <div className="platform-status-list">
            <article className="platform-status platform-status-live"><div className="platform-status-icon web-icon" aria-hidden="true">⌁</div><div><h3>{t.web}</h3><p>{t.webMeta}</p></div><span className="platform-availability live"><i></i>{t.webStatus}</span></article>
            <article className="platform-status"><div className="platform-status-icon android-icon" aria-hidden="true">▣</div><div><h3>{t.android}</h3><p>{isAvailable ? t.androidMetaAvailable : t.androidMetaPreparing}</p></div><a className={`platform-availability ${isAvailable ? "live" : "pending"}`} href="#android-release"><i></i>{isAvailable ? t.androidStatusAvailable : t.androidStatusPreparing}</a></article>
            <article className="platform-status"><div className="platform-status-icon ios-icon" aria-hidden="true">●</div><div><h3>{t.ios}</h3><p>{t.iosMeta}</p></div><span className="platform-availability pending"><i></i>{t.iosStatus}</span></article>
          </div>
        </div>
      </section>

      <section className="release-section chrome-release-section" id="android-release">
        <div className="site-shell chrome-release-layout">
          <div className="release-copy">
            <p className="eyebrow"><span></span>{t.releaseEyebrow}</p>
            <h2>{isAvailable ? t.releaseAvailableTitle : t.releasePreparingTitle}</h2>
            <p>{isAvailable ? t.releaseAvailableBody : t.releasePreparingBody}</p>
            <div className={`release-status ${isAvailable ? "is-ready" : ""}`}><span></span>{isAvailable ? t.officialFileReady : t.officialFilePreparing}</div>
          </div>
          <aside className="release-details-card chrome-release-card">
            <h3>{t.releaseInfo}</h3>
            {isAvailable ? (
              <>
                <dl>
                  <div><dt>{t.currentVersion}</dt><dd>{androidRelease.version} · Build {androidRelease.build}</dd></div>
                  <div><dt>{t.packageName}</dt><dd>{androidRelease.packageName}</dd></div>
                  <div><dt>{t.releaseDate}</dt><dd>{valueOrFallback(androidRelease.releasedAt)}</dd></div>
                  <div><dt>{t.fileSize}</dt><dd>{valueOrFallback(androidRelease.fileSize)}</dd></div>
                  <div className="checksum"><dt>{t.checksum}</dt><dd>{valueOrFallback(androidRelease.sha256)}</dd></div>
                  <div><dt>{t.certificateChecksum}</dt><dd>{valueOrFallback(androidRelease.certificateSha256)}</dd></div>
                </dl>
                <a className="apk-button download-link" href={androidRelease.downloadUrl ?? undefined}>{t.download}</a>
                {releaseNotes.length > 0 && <div className="release-notes"><strong>{t.releaseNotes}</strong><ul>{releaseNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>}
              </>
            ) : (
              <>
                <dl className="planned-release-details"><div><dt>{t.plannedVersion}</dt><dd>{androidRelease.version} · Build {androidRelease.build}</dd></div><div><dt>{t.packageName}</dt><dd>{androidRelease.packageName}</dd></div></dl>
                <div className="release-expectations"><strong>{t.releaseIncludesTitle}</strong><ul>{t.releaseIncludes.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul></div>
              </>
            )}
          </aside>
        </div>
      </section>

      {isAvailable && <section className="install-section"><div className="site-shell"><h2>{t.installTitle}</h2><div className="install-grid">{t.installSteps.map(([heading, body], index) => <article key={heading}><span>{index + 1}</span><h3>{heading}</h3><p>{body}</p></article>)}</div></div></section>}

      <section className="safety-section chrome-safety-section"><div className="site-shell chrome-safety-grid"><article><span className="safety-mark">✓</span><h2>{t.safetyTitle}</h2><p>{t.safetyBody}</p></article><article><span className="safety-mark">↻</span><h2>{t.updatesTitle}</h2><p>{t.updatesBody}</p></article></div></section>

      <footer className="site-footer"><div className="site-shell"><div className="footer-top"><Link className="brand" href={initialLocale === "en" ? "/en" : "/"}><Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} /><span><strong>DuolinTing</strong><small>多邻听</small></span></Link><nav><Link href={initialLocale === "en" ? "/en/contribute" : "/contribute"}>{t.contribute}</Link><Link href={initialLocale === "en" ? "/en/privacy" : "/privacy"}>Privacy</Link><Link href={initialLocale === "en" ? "/en/terms" : "/terms"}>Terms</Link><a href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">GitHub</a></nav></div></div></footer>
    </main>
  );
}
