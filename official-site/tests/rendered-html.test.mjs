import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the DuolinTing official site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /DuolinTing/);
  assert.match(html, /把真实世界的音频和视频/);
  assert.match(html, /下载 Android APK/);
  assert.match(html, /github-mark\.svg/);
  assert.doesNotMatch(html, /&lt;\/&gt;/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/);
});

test("uses a product-led web learner call to action on the download page", async () => {
  const response = await render("/download");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /听懂每一句，从现在开始/);
  assert.match(html, /网页学习端/);
  assert.match(html, /网页立即体验/);
  assert.match(html, /Android APK 正在准备中/);
  assert.match(html, /当前暂无可下载文件/);
  assert.match(html, /发布时，本页会同步提供/);
  assert.match(html, /chrome-product-browser/);
  assert.doesNotMatch(html, /三步安装/);
  assert.doesNotMatch(html, /下载 Android APK/);
});

test("server-renders the contribution guide with the real production workflow", async () => {
  const response = await render("/contribute");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /用真实媒体，贡献真正能练的听力课/);
  assert.match(html, /Admin 工作台和「任务广场」/);
  assert.match(html, /字幕工作流/);
  assert.match(html, /docs-sidebar/);
  assert.match(html, /docs-toc/);
  assert.match(html, /admin-course-workbench\.webp/);
  assert.match(html, /课程权限与任务分发已集成到 Admin 工作台/);
  assert.match(html, /不得抓取或复制 YouZack/);
});

test("publishes crawl discovery, canonical URLs, and separate English routes", async () => {
  const [robots, sitemap, download, englishHome, englishGuide] = await Promise.all([
    render("/robots.txt"),
    render("/sitemap.xml"),
    render("/download"),
    render("/en"),
    render("/en/contribute"),
  ]);

  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/www\.duolinting\.cn\/sitemap\.xml/);

  assert.equal(sitemap.status, 200);
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /https:\/\/www\.duolinting\.cn\/contribute/);
  assert.match(sitemapXml, /https:\/\/www\.duolinting\.cn\/en\/contribute/);

  const downloadHtml = await download.text();
  assert.match(downloadHtml, /rel="canonical" href="https:\/\/www\.duolinting\.cn\/download"/);
  assert.match(downloadHtml, /property="og:image"/);

  const englishHomeHtml = await englishHome.text();
  assert.match(englishHomeHtml, /Turn real-world audio and video into practice/);
  assert.match(englishHomeHtml, /<main lang="en">/);
  assert.match(englishHomeHtml, /rel="canonical" href="https:\/\/www\.duolinting\.cn\/en"/);
  assert.match(englishHomeHtml, /hrefLang="zh-CN" href="https:\/\/www\.duolinting\.cn"/);

  const englishGuideHtml = await englishGuide.text();
  assert.match(englishGuideHtml, /Contribution guide/);
  assert.match(englishGuideHtml, /application\/ld\+json/);
});

test("uses the product design system and real product assets", async () => {
  const [page, css, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(css, /--brand: #1cb0f6/);
  assert.match(css, /--green: #58cc02/);
  assert.match(css, /--ink: #172033/);
  assert.match(page, /duolinting-logo-ear\.png/);
  assert.match(page, /learner-web\.webp/);
  assert.match(page, /learner-mobile\.webp/);
  assert.match(page, /admin-course-workbench\.webp/);
  assert.match(page, /learnerWebUrl/);
  assert.doesNotMatch(page, /href="\/download">\{t\.hero\.web\}/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("server-renders feature landing pages with per-page metadata and structured data", async () => {
  const [zh, en] = await Promise.all([
    render("/practice/intensive-listening"),
    render("/en/practice/intensive-listening"),
  ]);

  assert.equal(zh.status, 200);
  const zhHtml = await zh.text();
  assert.match(zhHtml, /逐句精听 · 第二阶段/);
  assert.match(zhHtml, /先听、再判断、再核对/);
  assert.match(zhHtml, /rel="canonical" href="https:\/\/www\.duolinting\.cn\/practice\/intensive-listening"/);
  assert.match(zhHtml, /href="https:\/\/www\.duolinting\.cn\/en\/practice\/intensive-listening" hreflang="en"/);
  assert.match(zhHtml, /application\/ld\+json/);
  assert.match(zhHtml, /"@type":"FAQPage"/);
  assert.match(zhHtml, /landing-related-card/);

  assert.equal(en.status, 200);
  const enHtml = await en.text();
  assert.match(enHtml, /Line-by-line listening · Stage two/);
  assert.match(enHtml, /<main class="landing-page" lang="en">/);
  assert.match(enHtml, /rel="canonical" href="https:\/\/www\.duolinting\.cn\/en\/practice\/intensive-listening"/);
});

test("server-renders the blog index and posts with BlogPosting structured data", async () => {
  const [index, post, enPost] = await Promise.all([
    render("/blog"),
    render("/blog/intensive-listening-method"),
    render("/en/blog/intensive-listening-method"),
  ]);

  assert.equal(index.status, 200);
  const indexHtml = await index.text();
  assert.match(indexHtml, /博客与教程/);
  assert.match(indexHtml, /blog-index-card/);
  assert.match(indexHtml, /什么是精听？精听的正确步骤/);

  assert.equal(post.status, 200);
  const postHtml = await post.text();
  assert.match(postHtml, /先听、判断、核对、重复/);
  assert.match(postHtml, /"@type":"BlogPosting"/);
  assert.match(postHtml, /rel="canonical" href="https:\/\/www\.duolinting\.cn\/blog\/intensive-listening-method"/);
  assert.match(postHtml, /href="https:\/\/www\.duolinting\.cn\/en\/blog\/intensive-listening-method" hreflang="en"/);

  assert.equal(enPost.status, 200);
  const enPostHtml = await enPost.text();
  assert.match(enPostHtml, /<main class="blog-page" lang="en">/);
  assert.match(enPostHtml, /rel="canonical" href="https:\/\/www\.duolinting\.cn\/en\/blog\/intensive-listening-method"/);
});
