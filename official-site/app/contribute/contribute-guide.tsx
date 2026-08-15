"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { officialSiteHref } from "../content/site-url";
import { StructuredData } from "../components/structured-data";

type Locale = "zh" | "en";

type GuideCopy = {
  home: string;
  language: string;
  nav: Array<[string, string]>;
  docs: {
    label: string;
    breadcrumb: string;
    updated: string;
    sidebar: { gettingStarted: string; workspace: string; publishing: string; overview: string; prepare: string; path: string; directory: string; course: string; workbench: string; subtitles: string; waveform: string; publish: string; checklist: string; maintenance: string; rules: string; code: string };
    toc: { overview: string; start: string; workspace: string; checklist: string; maintenance: string; rules: string; code: string };
    overview: { title: string; body: string; callout: string };
    media: { title: string; body: string; caption: string };
    next: { previous: string; next: string; start: string; workspace: string };
  };
  hero: { eyebrow: string; title: string; lead: string; primary: string; secondary: string; facts: string[]; screenshot: string };
  before: { eyebrow: string; title: string; lead: string; items: Array<{ mark: string; title: string; body: string }> };
  path: { eyebrow: string; title: string; lead: string; steps: Array<{ title: string; body: string }> };
  workspace: { eyebrow: string; title: string; lead: string; note: string; sections: Array<{ id: string; number: string; title: string; intro: string; actions: string[]; aside?: { title: string; body: string } }> };
  checklist: { eyebrow: string; title: string; lead: string; items: string[]; button: string };
  maintenance: { eyebrow: string; title: string; lead: string; cards: Array<{ mark: string; title: string; body: string }> };
  rules: { eyebrow: string; title: string; lead: string; items: string[] };
  code: { eyebrow: string; title: string; body: string; action: string; note: string };
  footer: { home: string; download: string; guide: string; privacy: string; terms: string; source: string; statement: string };
};

const githubUrl = "https://github.com/VeejaLiu/duolinting";

const copy: Record<Locale, GuideCopy> = {
  zh: {
    home: "返回首页",
    language: "EN",
    nav: [["开始制作", "start"], ["后台工作台", "workspace"], ["发布检查", "checklist"], ["开源协作", "code"]],
    docs: {
      label: "贡献文档",
      breadcrumb: "内容贡献",
      updated: "最后更新：2026-08-16",
      sidebar: { gettingStarted: "开始贡献", workspace: "后台工作台", publishing: "发布与维护", overview: "概述", prepare: "开始前确认", path: "制作路径", directory: "目录结构", course: "课程管理", workbench: "制课工作台", subtitles: "导入字幕", waveform: "波形与翻译", publish: "保存与发布", checklist: "发布前检查", maintenance: "发布后维护", rules: "内容与授权规则", code: "代码贡献" },
      toc: { overview: "概述", start: "开始贡献内容", workspace: "后台工作台", checklist: "发布前检查", maintenance: "发布后维护", rules: "内容与授权规则", code: "代码贡献" },
      overview: { title: "用真实媒体，贡献真正能练的听力课。", body: "DuolinTing 将真实世界的音视频组织成泛听、逐句精听与难点复习。贡献者把拥有使用权的媒体、准确的字幕和经过复核的翻译，制作成学习者可以反复练习的课程。", callout: "内容工作台由维护者配置的管理员账号使用；目前没有公开投稿表单或自助开通入口。" },
      media: { title: "课程制作的核心，是逐句准确。", body: "媒体、字幕时间轴、译文和可接受答案会共同决定学习者的体验。请把每一句当作一段独立的练习：听得到、对得上、看得懂，也有合理的答案边界。", caption: "制课工作台：上传媒体、逐句校准波形与字幕，然后保存或发布。" },
      next: { previous: "上一节", next: "下一节", start: "开始前确认", workspace: "后台工作台" },
    },
    hero: {
      eyebrow: "DuolinTing 贡献指南",
      title: "把你有权使用的真实媒体，做成一门能反复练的听力课。",
      lead: "这份指南带你从素材准备走到发布与维护：上传音视频、导入字幕、在波形上校准每一句，再把课程交给学习者。",
      primary: "查看制作路径",
      secondary: "前往 GitHub",
      facts: ["仅上传有权使用的内容", "支持音频与视频 · 单个文件不超过 120 MB", "草稿保存后，发布课程才会在学习端可见"],
      screenshot: "DuolinTing 制课工作台的媒体、波形与字幕编辑界面",
    },
    before: {
      eyebrow: "开始前，先确认三件事",
      title: "好课程来自准确素材，也来自清楚的边界。",
      lead: "我们希望贡献者把精力花在真正可发布、可复习的课程上。先完成以下确认，再进入工作台。",
      items: [
        { mark: "01", title: "你拥有内容使用权", body: "音频、视频、字幕、封面和译文都必须由你创作、已获授权，或采用允许此用途的明确开放许可。保留来源、许可和必要的署名信息。" },
        { mark: "02", title: "你已获得协作权限", body: "内容工作台目前只向由维护者配置的管理员账号开放；没有公开投稿表单或自助开通入口。需要协作时，请先与项目维护者沟通。" },
        { mark: "03", title: "你愿意为质量负责", body: "AI 可以协助翻译，但不能替代核对。发布前请亲自听完媒体、检查每一条时间轴和所有面向学习者的文本。" },
      ],
    },
    path: {
      eyebrow: "从素材到课程",
      title: "一门课程，沿着这 8 步完成。",
      lead: "推荐按这个顺序工作。这样目录、媒体、字幕和发布状态始终清楚，不会在最后阶段反复返工。",
      steps: [
        { title: "准备素材", body: "整理已获权利的媒体、原始字幕、来源说明与封面素材。" },
        { title: "配置管理员账号", body: "由维护者配置工作台访问权限；登录后再开始创建内容。" },
        { title: "建立目录", body: "先创建内容分类和学习系列，为课程确定清晰归属。" },
        { title: "新建课程", body: "选择学习系列，补齐标题、难度、摘要、来源与课程封面。" },
        { title: "上传媒体", body: "在制课工作台上传音频或视频，并确认播放正常。" },
        { title: "导入并校准字幕", body: "导入字幕后，在波形上逐句检查起止时间和文本。" },
        { title: "翻译与复核", body: "补充译文、可接受答案与本地化信息，并逐项人工复查。" },
        { title: "保存并发布", body: "先保存草稿；所有检查通过后，将状态改为发布。" },
      ],
    },
    workspace: {
      eyebrow: "后台工作台，逐步操作",
      title: "用真实的制课流程，把一段媒体组织成练习。",
      lead: "管理员后台不是公开投稿工具，而是受控的内容生产工作台。以下名称与操作对应现有工作区。",
      note: "提示：保存草稿不等于上线；只有“发布”状态的课程才会显示在学习端。",
      sections: [
        {
          id: "directory", number: "01", title: "目录结构：先给课程一个清楚的位置", intro: "进入“目录结构”，建立学习者看得到的内容层级。内容分类用于组织材料类型；学习系列是同一主题或路径下的一组课程。",
          actions: ["新建内容分类，填写名称、说明、颜色和可选封面。", "在分类下新建学习系列，明确课程面向的主题、难度或学习路径。", "补齐英语、泰语、日语本地化。可使用 AI 辅助填充，但发布前必须人工检查词义与表达。"],
          aside: { title: "先目录，后课程", body: "课程管理需要已有学习系列。若还没有分类或学习系列，先回到“目录结构”创建。" },
        },
        {
          id: "course", number: "02", title: "课程管理：建立课程的基本信息", intro: "进入“课程管理”，选择学习系列后新建课程，或从已有课程继续编辑。这里适合核对课程是否完整、排序是否合理以及发布状态。",
          actions: ["选择学习系列，新建课程并填写标题、难度、来源、摘要与状态。", "为标题和摘要补齐本地化；如有封面，确认它同样拥有可公开使用的权利。", "使用筛选、排序和完整度信息管理草稿、已发布和已归档课程。"],
        },
        {
          id: "workbench", number: "03", title: "制课工作台：上传媒体，完成逐句练习", intro: "进入“制课工作台”，把课程信息、媒体和字幕放在同一个编辑流程里。保存前至少需要选择媒体、学习系列并填写课程标题。",
          actions: ["上传音频或视频。工作台接受 audio/video 文件，当前前端预检上限为 120 MB；超过时请压缩或拆分后再试。", "填写学习系列、标题、难度、状态、来源、摘要及各语言的标题和摘要；课程封面为可选项。", "媒体上传或替换后先试听，确认文件本身、长度和课程内容完全对应。"],
          aside: { title: "建议从草稿开始", body: "先选择“草稿”，让媒体、字幕和翻译在后台可持续编辑。所有内容核对完毕，再切换为“发布”。" },
        },
        {
          id: "subtitles", number: "04", title: "导入字幕：把原始材料变成可编辑的句子", intro: "工作台支持从文件导入或直接粘贴字幕文本。导入后得到的是字幕草稿，还需要和媒体逐句核对。",
          actions: ["可导入 .srt、.vtt、.ass、.lrc 或 .txt 文件，也可以粘贴文本。", "双语字幕会识别两行结构；根据素材选择“第一行是中文”或“第二行是中文”。", "需要整体前移或后移时，使用以毫秒为单位的全局时间偏移，再抽查开头、中段与结尾。"],
        },
        {
          id: "waveform", number: "05", title: "波形与翻译：让每一句真的能练", intro: "在波形和时间轴上逐句工作。学习者的循环、听写与复习都依赖这些文本和精确的起止时间。",
          actions: ["拖动或缩放波形，调整每个片段的开始与结束；也可用“设开始／设结束”精确取点。", "按需要新增句子、合并下一句、删除错误片段，或批量调整时间偏移。", "逐句补齐原文、各语言译文与可接受答案。AI 可补齐或重译中文、泰语、日语，但每一句都要由人工听辨和复核。"],
          aside: { title: "时间轴的标准", body: "每个片段应紧贴实际说话范围：不要切掉首尾音，也不要把两句不应合并的内容放在同一条里。" },
        },
        {
          id: "publish", number: "06", title: "保存与发布：把完成的课程交给学习者", intro: "保存会写入课程和字幕。课程处于草稿时只在后台保存；切换为“发布”后，学习端才可以看到它。",
          actions: ["保存前检查工作台的必填信息、媒体和字幕是否都已完成。", "先保存草稿，离开或切换工作区前确认未保存修改已经处理。", "所有发布检查通过后将状态设为“发布”，再从课程管理中确认其状态与内容完整度。"],
        },
      ],
    },
    checklist: {
      eyebrow: "发布前检查",
      title: "在点下“发布”前，逐项打勾。",
      lead: "下面每一项都直接影响学习者能否顺畅完成泛听、逐句精听和难点复习。",
      items: ["我对媒体、字幕、封面、翻译和其他素材拥有必要的使用权，并已保留来源与署名要求。", "媒体可以完整播放，内容、课程标题、来源和所属学习系列完全对应。", "字幕的每句文本准确，起止时间与实际语音对齐；开头、中段和结尾都已试听。", "中文、泰语、日语译文及本地化标题／摘要已人工复核，AI 生成内容没有直接跳过检查。", "每句的可接受答案足以覆盖合理表达，同时不会把错误答案误判为正确。", "课程状态、封面、难度、摘要和来源信息都已核对；草稿不会被误当成已上线课程。"],
      button: "返回工作台说明",
    },
    maintenance: {
      eyebrow: "发布后也要照看课程",
      title: "把反馈带回内容，让下一次练习更好。",
      lead: "发布不是结束。后台提供课程维护、课程演示和产品层面的反馈入口。",
      cards: [
        { mark: "↻", title: "课程管理", body: "筛选、排序、编辑或归档课程；结合媒体与字幕完整度继续补齐内容。" },
        { mark: "✓", title: "反馈中心", body: "处理学习者提交的可接受答案反馈，将其标记为已处理或已忽略，并回到对应句子修订。" },
        { mark: "▶", title: "视频录制", body: "按逐句流程录制已制作课程的演示视频，方便对外展示或内部复盘。" },
        { mark: "◔", title: "增长分析", body: "查看注册、DAU／WAU／MAU 和端侧分布，用整体趋势评估内容与产品节奏。" },
      ],
    },
    rules: {
      eyebrow: "内容与授权规则",
      title: "我们尊重创作者，也保护学习者。",
      lead: "请在每一次导入和发布前遵守这些原则。",
      items: ["只上传自己创作、已获许可或明确开放许可允许使用的内容；不确定时，不上传、不发布。", "不得复制、上传或重新分发未经授权的音频、视频、字幕、封面或翻译。", "不得抓取或复制 YouZack 整理的配套字幕。DuolinTing 是受其听力学习理念启发的独立开源项目。", "内容协作账号由维护者配置；请不要将管理员权限或上传入口误解为公开的自助投稿服务。"],
    },
    code: {
      eyebrow: "代码与部署贡献",
      title: "想让 DuolinTing 本身变得更好？",
      body: "源代码以 Apache-2.0 开放。产品改进、文档、部署和工程协作可从 GitHub 仓库开始；课程内容协作仍需要由维护者配置后台账号。",
      action: "查看 GitHub 仓库",
      note: "开源代码贡献与受控内容发布，是两条清楚、互相配合的协作路径。",
    },
    footer: { home: "首页", download: "下载", guide: "贡献指南", privacy: "隐私", terms: "使用条款", source: "GitHub", statement: "DuolinTing 是受 YouZack 听力学习理念启发的独立开源项目，并非 YouZack 官方产品，也不代表获得其官方背书。" },
  },
  en: {
    home: "Back to home",
    language: "中文",
    nav: [["Start creating", "start"], ["Workspace", "workspace"], ["Publish checks", "checklist"], ["Open source", "code"]],
    docs: {
      label: "Contribution docs",
      breadcrumb: "Content contributions",
      updated: "Last updated: August 16, 2026",
      sidebar: { gettingStarted: "Getting started", workspace: "Admin workspace", publishing: "Publish and maintain", overview: "Overview", prepare: "Before you begin", path: "Creation path", directory: "Catalogue structure", course: "Course management", workbench: "Creation workspace", subtitles: "Import subtitles", waveform: "Waveform and translation", publish: "Save and publish", checklist: "Publish checks", maintenance: "Maintain lessons", rules: "Content and rights", code: "Code contributions" },
      toc: { overview: "Overview", start: "Start contributing", workspace: "Admin workspace", checklist: "Publish checks", maintenance: "Maintain lessons", rules: "Content and rights", code: "Code contributions" },
      overview: { title: "Use real media to contribute listening lessons people can truly practice.", body: "DuolinTing organizes real-world audio and video into warm-up listening, line-by-line practice, and difficult-line review. Contributors turn rights-cleared media, accurate subtitles, and reviewed translations into lessons learners can revisit.", callout: "The content workspace is used by administrator accounts configured by maintainers. There is currently no public submission form or self-service account creation." },
      media: { title: "Accurate lines are the heart of lesson production.", body: "Media, subtitle timing, translations, and accepted answers work together to shape a learner’s experience. Treat every line as a practice unit: hearable, precisely aligned, understandable, and bounded by reasonable answers.", caption: "Creation workspace: upload media, align waveform and subtitles line by line, then save or publish." },
      next: { previous: "Previous", next: "Next", start: "Before you begin", workspace: "Admin workspace" },
    },
    hero: {
      eyebrow: "DuolinTing contribution guide",
      title: "Turn real media you have the right to use into a listening lesson worth repeating.",
      lead: "This guide takes you from source preparation through publishing and maintenance: upload media, import subtitles, align every line on the waveform, then share the lesson with learners.",
      primary: "See the creation path",
      secondary: "Visit GitHub",
      facts: ["Upload only content you have the right to use", "Audio and video supported · 120 MB per file", "A lesson becomes visible to learners only after it is published"],
      screenshot: "DuolinTing creation workspace showing media, waveform, and subtitles",
    },
    before: {
      eyebrow: "Before you begin",
      title: "Strong lessons need accurate source material and clear boundaries.",
      lead: "We want contributors to spend their energy on lessons that can genuinely be published and practiced. Confirm these points before opening the workspace.",
      items: [
        { mark: "01", title: "You have the rights to the material", body: "Audio, video, subtitles, cover art, and translations must be yours, licensed to you, or covered by a clear open licence that permits this use. Keep source, licence, and attribution details." },
        { mark: "02", title: "You have collaboration access", body: "The content workspace is currently available only to administrator accounts configured by maintainers. There is no public submission form or self-service account creation; contact the maintainers before collaborating." },
        { mark: "03", title: "You will own the quality check", body: "AI can help with translation, but it cannot replace review. Before publishing, listen through the media and check every timeline entry and learner-facing text yourself." },
      ],
    },
    path: {
      eyebrow: "From source to lesson",
      title: "A lesson comes together in eight clear steps.",
      lead: "This order keeps the catalogue, media, subtitles, and release status clear—without late-stage rework.",
      steps: [
        { title: "Prepare source material", body: "Gather rights-cleared media, source subtitles, attribution details, and cover assets." },
        { title: "Get an admin account", body: "A maintainer configures workspace access before you begin creating content." },
        { title: "Build the catalogue", body: "Create a content category and learning series to give the lesson a clear home." },
        { title: "Create the lesson", body: "Choose the series and complete title, difficulty, summary, source, and cover." },
        { title: "Upload media", body: "Upload audio or video in the creation workspace and confirm it plays correctly." },
        { title: "Import and align subtitles", body: "Import subtitles, then check text and timing line by line on the waveform." },
        { title: "Translate and review", body: "Add translations, accepted answers, and localized details; review each one manually." },
        { title: "Save and publish", body: "Save a draft first; switch to published only after every check passes." },
      ],
    },
    workspace: {
      eyebrow: "The admin workspace, step by step",
      title: "Turn a piece of real media into practice through the production workflow.",
      lead: "The admin area is a controlled content-production workspace, not a public upload form. These labels and actions match the current workspace.",
      note: "Note: saving a draft does not put it live. Only a lesson with Published status is visible in the learner app.",
      sections: [
        { id: "directory", number: "01", title: "Catalogue structure: give the lesson a clear place first", intro: "Open Catalogue structure to create the hierarchy learners will see. Content categories organize material types; learning series group lessons by theme or path.", actions: ["Create a content category with its name, description, colour, and optional cover.", "Create a learning series inside that category and define the topic, level, or learning path it represents.", "Complete English, Thai, and Japanese localization. AI can help fill fields, but a person must check wording and meaning before publishing."], aside: { title: "Catalogue before lessons", body: "Course management needs an existing learning series. If no category or series exists, create it in Catalogue structure first." } },
        { id: "course", number: "02", title: "Course management: establish the lesson details", intro: "In Course management, select a learning series to create a lesson or continue editing an existing one. This is where you can verify completeness, ordering, and publication status.", actions: ["Select a learning series; create the lesson and complete its title, difficulty, source, summary, and status.", "Add localized titles and summaries. If you use cover art, verify that you also have the right to publish it.", "Use filters, ordering, and completeness information to manage drafts, published lessons, and archived lessons."] },
        { id: "workbench", number: "03", title: "Creation workspace: upload the media and build practice", intro: "The Creation workspace puts course details, media, and subtitles into one editing flow. Before saving, a media item, learning series, and lesson title are required.", actions: ["Upload audio or video. The workspace accepts audio/video files and currently checks a 120 MB maximum before upload; compress or split larger files.", "Complete series, title, difficulty, status, source, summary, and localized title/summary fields. The course cover is optional.", "After uploading or replacing media, listen through it and make sure the file, duration, and lesson all match."], aside: { title: "Start as a draft", body: "Choose Draft while media, subtitles, and translations are still being edited. Switch to Published only after you have reviewed everything." } },
        { id: "subtitles", number: "04", title: "Import subtitles: turn source material into editable lines", intro: "The workspace imports subtitle files or pasted subtitle text. Imported entries are drafts; they still need a line-by-line check against the media.", actions: ["Import .srt, .vtt, .ass, .lrc, or .txt files, or paste subtitle text directly.", "Bilingual subtitles can be recognized as two-line structures; choose whether Chinese appears on the first or second line.", "For a whole-track adjustment, use the global time offset in milliseconds, then sample the beginning, middle, and end." ] },
        { id: "waveform", number: "05", title: "Waveform and translation: make every line genuinely practiceable", intro: "Work line by line on the waveform and timeline. Learners’ looping, dictation, and review all depend on accurate timing and text.", actions: ["Drag or zoom the waveform to adjust each segment’s start and end, or use Set start / Set end for precise points.", "Add a line, merge with the next line, delete a wrong segment, or apply a batch timing offset when needed.", "Complete source text, translations, and accepted answers for every line. AI can fill or retranslate Chinese, Thai, and Japanese, but every line needs human listening and review."], aside: { title: "Timing standard", body: "Each segment should closely match the spoken range: do not cut off word beginnings or endings, and do not combine two lines that should be practiced separately." } },
        { id: "publish", number: "06", title: "Save and publish: hand a finished lesson to learners", intro: "Saving writes the lesson and subtitles. A Draft is stored only in the admin area; once its status becomes Published, learners can see it.", actions: ["Check the required lesson fields, media, and subtitles before saving.", "Save a draft first; resolve any unsaved changes before leaving or switching workspace areas.", "When all release checks pass, set the status to Published and verify its status and completeness in Course management." ] },
      ],
    },
    checklist: { eyebrow: "Publish checks", title: "Before selecting Published, check every item.", lead: "Each item directly affects whether a learner can warm up, practice line by line, and review difficult parts without friction.", items: ["I have the rights needed for the media, subtitles, cover, translations, and other assets, and I retained source and attribution requirements.", "The media plays through; its content matches the lesson title, source, and learning series.", "Every subtitle is accurate and aligned with spoken audio; I sampled the beginning, middle, and end.", "Chinese, Thai, and Japanese translations plus localized titles/summaries were reviewed by a person; no AI output was published unchecked.", "Accepted answers cover reasonable responses without incorrectly treating wrong answers as correct.", "Status, cover, difficulty, summary, and source details are correct; a draft is not being mistaken for a live lesson."], button: "Back to workspace steps" },
    maintenance: { eyebrow: "Care for lessons after release", title: "Bring feedback back into the content, so the next practice is better.", lead: "Publication is not the last step. The admin area provides ways to maintain lessons, record a course walk-through, and review product-level signals.", cards: [{ mark: "↻", title: "Course management", body: "Filter, order, edit, or archive lessons, and use media/subtitle completeness to guide further improvements." }, { mark: "✓", title: "Feedback center", body: "Handle learner feedback about accepted answers, mark it processed or ignored, then revise the relevant line where needed." }, { mark: "▶", title: "Video recording", body: "Record a line-by-line walkthrough of a prepared lesson for demonstrations or internal review." }, { mark: "◔", title: "Growth analysis", body: "Review registrations, DAU/WAU/MAU, and client distribution to understand the overall product and content rhythm." }] },
    rules: { eyebrow: "Content and rights", title: "We respect creators and protect learners.", lead: "Follow these principles before every import and release.", items: ["Upload only material you created, have permission to use, or that is explicitly open-licensed for this use. If you are unsure, do not upload or publish it.", "Do not copy, upload, or redistribute audio, video, subtitles, cover art, or translations without authorization.", "Do not scrape or copy companion subtitles curated by YouZack. DuolinTing is an independent open-source project inspired by its listening-practice approach.", "Content accounts are configured by maintainers; do not interpret administrator access or uploads as a public, self-service submission service."] },
    code: { eyebrow: "Code and deployment contributions", title: "Want to make DuolinTing itself better?", body: "The source code is open under Apache-2.0. Product improvements, documentation, deployment, and engineering collaboration can start from the GitHub repository; content collaboration still needs an admin account configured by a maintainer.", action: "View the GitHub repository", note: "Open-source code contribution and controlled content publishing are two clear, complementary collaboration paths." },
    footer: { home: "Home", download: "Download", guide: "Contribution guide", privacy: "Privacy", terms: "Terms", source: "GitHub", statement: "DuolinTing is an independent open-source project inspired by YouZack’s approach to listening practice. It is not an official YouZack product and is not endorsed by YouZack." },
  },
};

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ContributeGuide({ initialLocale = "zh" }: { initialLocale?: Locale }) {
  const [locale] = useState<Locale>(initialLocale);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy[locale];
  const nav = useMemo(() => t.nav, [t.nav]);
  const docs = t.docs;
  const languagePath = initialLocale === "en" ? "/contribute" : "/en/contribute";

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  return (
    <main className="contribute-docs-page" lang={locale === "zh" ? "zh-CN" : "en"}>
      <StructuredData value={{
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: locale === "zh" ? "DuolinTing 贡献指南" : "DuolinTing contribution guide",
        description: locale === "zh" ? "了解如何用拥有使用权的真实媒体，在 DuolinTing 后台制作、检查、发布并维护一门逐句听力课。" : "Learn how to turn rights-cleared real media into a DuolinTing listening lesson, from the admin workspace through publication and maintenance.",
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        mainEntityOfPage: officialSiteHref(locale === "zh" ? "/contribute" : "/en/contribute"),
        image: officialSiteHref("/admin-course-workbench.png"),
        author: { "@type": "Organization", name: "DuolinTing" },
        publisher: { "@type": "Organization", name: "DuolinTing", logo: { "@type": "ImageObject", url: officialSiteHref("/duolinting-logo-ear.png") } },
        dateModified: "2026-08-16",
      }} />
      <header className="docs-header">
        <div className="docs-header-inner">
          <Link className="brand" href="/" aria-label="DuolinTing home">
            <Image className="brand-logo" src="/duolinting-logo-ear.png" alt="" width={44} height={42} priority />
            <span><strong>DuolinTing</strong><small>多邻听</small></span>
          </Link>
          <span className="docs-product-label">{docs.label}</span>
          <nav className={`docs-top-nav ${menuOpen ? "is-open" : ""}`} aria-label="Contribution guide navigation">
            {nav.map(([label, id]) => <button key={id} type="button" onClick={() => { scrollToSection(id); setMenuOpen(false); }}>{label}</button>)}
          </nav>
          <div className="docs-header-actions">
            <Link className="language-switch" href={languagePath}>{t.language}</Link>
            <Link className="docs-home-link" href={initialLocale === "en" ? "/en" : "/"}>{t.home} <span aria-hidden="true">↗</span></Link>
            <button className="docs-menu-trigger" type="button" aria-expanded={menuOpen} aria-label="Toggle contribution guide navigation" onClick={() => setMenuOpen(!menuOpen)}><span></span><span></span><span></span></button>
          </div>
        </div>
      </header>

      <div className="docs-shell">
        <aside className="docs-sidebar" aria-label="Contribution documentation">
          <nav>
            <p>{docs.sidebar.gettingStarted}</p>
            <a href="#overview" className="is-active">{docs.sidebar.overview}</a>
            <a href="#start">{docs.sidebar.prepare}</a>
            <a href="#path">{docs.sidebar.path}</a>
            <p>{docs.sidebar.workspace}</p>
            {t.workspace.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{docs.sidebar[section.id as "directory" | "course" | "workbench" | "subtitles" | "waveform" | "publish"]}</a>)}
            <p>{docs.sidebar.publishing}</p>
            <a href="#checklist">{docs.sidebar.checklist}</a>
            <a href="#maintenance">{docs.sidebar.maintenance}</a>
            <a href="#rules">{docs.sidebar.rules}</a>
            <a href="#code">{docs.sidebar.code}</a>
          </nav>
          <a className="docs-github-link" href={githubUrl} target="_blank" rel="noreferrer"><span>&lt;/&gt;</span>{t.code.action}</a>
        </aside>

        <article className="docs-article">
          <div className="docs-breadcrumb"><Link href={initialLocale === "en" ? "/en" : "/"}>DuolinTing</Link><span>/</span><span>{docs.breadcrumb}</span></div>
          <section id="overview" className="docs-intro">
            <p className="docs-kicker">{t.hero.eyebrow}</p>
            <h1>{docs.overview.title}</h1>
            <p className="docs-lead">{docs.overview.body}</p>
            <p className="docs-callout"><span>i</span>{docs.overview.callout}</p>
            <ul className="docs-facts">{t.hero.facts.map((fact) => <li key={fact}><span>✓</span>{fact}</li>)}</ul>
          </section>

          <section className="docs-media-block">
            <div><p className="docs-section-label">{t.workspace.eyebrow}</p><h2>{docs.media.title}</h2><p>{docs.media.body}</p></div>
            <figure><div className="docs-browser-bar" aria-hidden="true"><i></i><i></i><i></i><span>DuolinTing · {locale === "zh" ? "制课工作台" : "Creation workspace"}</span></div><Image src="/admin-course-workbench.png" alt={t.hero.screenshot} width={1800} height={1328} sizes="(max-width: 900px) 100vw, 660px" priority /><figcaption>{docs.media.caption}</figcaption></figure>
          </section>

          <section id="start" className="docs-section">
            <p className="docs-section-label">{t.before.eyebrow}</p><h2>{t.before.title}</h2><p>{t.before.lead}</p>
            <ol className="docs-numbered-list">{t.before.items.map((item) => <li key={item.mark}><span>{item.mark}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></li>)}</ol>
          </section>

          <section id="path" className="docs-section">
            <p className="docs-section-label">{t.path.eyebrow}</p><h2>{t.path.title}</h2><p>{t.path.lead}</p>
            <ol className="docs-path-list">{t.path.steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
          </section>

          <section id="workspace" className="docs-section docs-workspace-intro"><p className="docs-section-label">{t.workspace.eyebrow}</p><h2>{t.workspace.title}</h2><p>{t.workspace.lead}</p><p className="docs-callout"><span>i</span>{t.workspace.note}</p></section>
          {t.workspace.sections.map((section) => <section className="docs-section docs-workspace-section" key={section.id} id={section.id}><div className="docs-section-heading"><span>{section.number}</span><h2>{section.title}</h2></div><p>{section.intro}</p><ul className="docs-check-list">{section.actions.map((action) => <li key={action}><span>✓</span>{action}</li>)}</ul>{section.aside && <aside className="docs-tip"><strong>{section.aside.title}</strong><p>{section.aside.body}</p></aside>}</section>)}

          <section className="docs-section" id="checklist"><p className="docs-section-label">{t.checklist.eyebrow}</p><h2>{t.checklist.title}</h2><p>{t.checklist.lead}</p><ul className="docs-release-list">{t.checklist.items.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul></section>

          <section className="docs-section" id="maintenance"><p className="docs-section-label">{t.maintenance.eyebrow}</p><h2>{t.maintenance.title}</h2><p>{t.maintenance.lead}</p><div className="docs-maintenance-list">{t.maintenance.cards.map((card) => <article key={card.title}><span>{card.mark}</span><div><h3>{card.title}</h3><p>{card.body}</p></div></article>)}</div></section>

          <section className="docs-section" id="rules"><p className="docs-section-label">{t.rules.eyebrow}</p><h2>{t.rules.title}</h2><p>{t.rules.lead}</p><ul className="docs-rules-list">{t.rules.items.map((item) => <li key={item}><span>!</span>{item}</li>)}</ul></section>

          <section className="docs-section" id="code"><p className="docs-section-label">{t.code.eyebrow}</p><h2>{t.code.title}</h2><p>{t.code.body}</p><a className="docs-action" href={githubUrl} target="_blank" rel="noreferrer">{t.code.action}<span>↗</span></a><p className="docs-fine-print">{t.code.note}</p></section>
          <nav className="docs-pagination" aria-label="Contribution guide pagination"><a href="#start"><small>{docs.next.previous}</small><strong>← {docs.next.start}</strong></a><a href="#workspace"><small>{docs.next.next}</small><strong>{docs.next.workspace} →</strong></a></nav>
        </article>

        <aside className="docs-toc" aria-label="On this page"><p>{locale === "zh" ? "本页总览" : "On this page"}</p><nav><a href="#overview">{docs.toc.overview}</a><a href="#start">{docs.toc.start}</a><a href="#workspace">{docs.toc.workspace}</a><a href="#checklist">{docs.toc.checklist}</a><a href="#maintenance">{docs.toc.maintenance}</a><a href="#rules">{docs.toc.rules}</a><a href="#code">{docs.toc.code}</a></nav></aside>
      </div>
    </main>
  );
}
