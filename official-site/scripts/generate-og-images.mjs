/**
 * Generate 1200x630 Open Graph cards for the practice landing pages and blog
 * posts, using satori (SVG) + sharp (PNG). Output lands in `public/` as
 * `og-<slug>.png` and is referenced from `app/content/*.ts`.
 *
 * The topic titles are mirrored here (not imported from the .ts data files) so
 * the script stays runnable as plain Node without a TS loader. When you add a
 * landing page or blog post, add its title pair here and re-run:
 *
 *   node scripts/generate-og-images.mjs
 *
 * The font path points at macOS's system CJK font. On other systems, point
 * FONT_PATH at any .ttf/.otf with CJK coverage.
 */
import React from "react";
import satori from "satori";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

// slug -> { zh: primary title, en: secondary title }
const topics = [
  { slug: "extensive-listening", zh: "泛听练习", en: "Extensive Listening" },
  { slug: "intensive-listening", zh: "精听方法", en: "Intensive Listening" },
  { slug: "dictation", zh: "逐句听写", en: "Dictation Practice" },
  { slug: "vocabulary", zh: "听力生词本", en: "Listening Vocabulary" },
  { slug: "difficult-review", zh: "难点复习", en: "Difficult-Line Review" },
  { slug: "intensive-listening-method", zh: "什么是精听？精听的正确步骤", en: "Intensive Listening Method" },
  { slug: "youzack-alternative", zh: "YouZack 替代", en: "YouZack Alternative" },
  { slug: "srt-to-listening-practice", zh: "SRT 字幕做成听力练习", en: "SRT to Listening Practice" },
];

const fontData = await readFile(FONT_PATH);

async function renderCard(topic) {
  const element = React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "68px",
        background: "linear-gradient(135deg, #16324f 0%, #1cb0f6 100%)",
        fontFamily: "og",
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", alignItems: "center" } },
      React.createElement("div", { style: { width: 22, height: 22, borderRadius: 11, background: "#58cc02" } }),
      React.createElement(
        "div",
        { style: { color: "#ffffff", fontSize: 30, fontWeight: 700, marginLeft: 14 } },
        "DuolinTing 多邻听",
      ),
    ),
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      React.createElement(
        "div",
        { style: { color: "#ffffff", fontSize: 64, fontWeight: 700, lineHeight: 1.2, maxWidth: 1060 } },
        topic.zh,
      ),
      React.createElement(
        "div",
        { style: { color: "#d3f0ff", fontSize: 30, marginTop: 18 } },
        topic.en,
      ),
    ),
  );

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "og", data: fontData, weight: 400, style: "normal" },
      { name: "og", data: fontData, weight: 700, style: "normal" },
    ],
  });

  const outPath = path.join(OUT_DIR, `og-${topic.slug}.png`);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  return outPath;
}

for (const topic of topics) {
  const outPath = await renderCard(topic);
  const meta = await sharp(outPath).metadata();
  console.log(`✓ ${outPath.replace(OUT_DIR + "/", "")}  (${meta.width}x${meta.height})`);
}
console.log(`\nGenerated ${topics.length} OG images into public/`);
