# DuolinTing 官网博客 / 教程大纲（SEO 内容规模化 · 第一批）

> 结论来源：`last30days` 社区调研（英文社区对 "YouZack alternative" 近 30 天无可信讨论，
> 属中文市场关键词）+ 中文网络检索（豆瓣 / CSDN / 360doc 存在 "YouZack 听力网站推荐 / 替代"
> 的真实搜索意图）。
>
> 因此：中文内容主打「YouZack 替代 + 精听方法 + SRT 字幕」三个高意图词；
> 英文内容主打「intensive listening / English listening practice / dictation」方法论词。
> 所有文章最终导流回 `/practice/<slug>` 落地页与 `/download`、`/contribute`。

这些大纲与 `app/content/landing-pages.ts` 同一套数据驱动模式，后续用
`/blog/[slug]`（复用 `/practice/[slug]` 的 `generateStaticParams` + `generateMetadata` 骨架）承载。

---

## 1. 什么是精听？精听的正确步骤（逐句精听方法）

- **路由（规划）**：`/blog/intensive-listening-method` 与 `/en/blog/intensive-listening-method`
- **目标关键词**：精听方法 / 精听步骤 / 什么是精听 / 逐句精听
  - 英文：intensive listening / line-by-line listening method / how to improve English listening
- **搜索意图**：informational（how-to），常青内容
- **大纲**：
  1. 开头：为什么"泛听很久了还是听不懂"——精听是补辨音短板的那一步。
  2. 精听 vs 泛听：一张对比，明确两者分工（内链 `/practice/extensive-listening`）。
  3. 精听的正确步骤：先听 → 判断 → 核对 → 重复，逐步解释"为什么必须先听后看"。
  4. 单句循环与变速怎么用最有效（内链 `/practice/intensive-listening`）。
  5. 精听之后：把难点交给复习阶段（内链 `/practice/difficult-review`）。
  6. 常见误区 3 条（边看字幕边听、无限重听、贪多求快）。
  7. CTA：网页立即体验 + 下载 APK。

---

## 2. YouZack 替代：用 DuolinTing 做逐句精听与听写

- **路由（规划）**：`/blog/youzack-alternative`（中文为主；英文视需求再配 `/en/blog/youzack-alternative`）
- **目标关键词**：YouZack 替代 / 类似 YouZack 的听力工具 / 逐句精听 app
- **搜索意图**：alternative/comparison（带转化倾向），承接 footer 已声明的"受 YouZack 理念启发"
- **大纲**：
  1. 开头：很多用过 YouZack 的学习者想找开源、可自部署的替代方案。
  2. 诚实对比：DuolinTing 与 YouZack 在"真实材料 + 逐句精听"理念上的共同点；不贬低、不冒充官方。
  3. 迁移指南：把 YouZack 里的学习习惯（泛听 → 精听 → 复习）在 DuolinTing 落地。
  4. 用自己合法内容制课（内链 `/contribute`）与开源自部署（内链 GitHub）。
  5. CTA：网页立即体验 + `/download`。
- **合规提醒**：通篇保持"独立开源项目、非 YouZack 官方、无官方背书"的表述，与 footer 一致。

---

## 3. 如何把 SRT 字幕做成逐句听力练习

- **路由（规划）**：`/blog/srt-to-listening-practice` 与 `/en/blog/srt-to-listening-practice`
- **目标关键词**：SRT 字幕 听力练习 / 字幕转听力 / 逐句听写
  - 英文：turn SRT subtitles into listening practice / subtitle listening practice
- **搜索意图**：how-to（工具类），衔接贡献指南、导流到产品
- **大纲**：
  1. 开头：手头有 SRT 字幕，怎么把它变成能逐句练的听力课。
  2. 准备素材：确认字幕时间轴准确、拥有内容使用权（内链 `/contribute` 的授权规则）。
  3. 导入与校准：SRT/VTT/ASS/LRC/TXT 导入、双语识别、全局时间偏移。
  4. 逐句精听流程：先听 → 判断 → 核对 → 循环。
  5. 听写与难点复习：把听写错误收进生词本（内链 `/practice/dictation`、`/practice/vocabulary`）。
  6. CTA：贡献指南 + 网页立即体验。
