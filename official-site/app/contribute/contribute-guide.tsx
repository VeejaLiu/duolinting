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
    sidebar: { gettingStarted: string; workspace: string; publishing: string; overview: string; prepare: string; path: string; collaboration: string; directory: string; course: string; workbench: string; subtitles: string; waveform: string; publish: string; checklist: string; maintenance: string; rules: string; code: string };
    toc: { overview: string; start: string; collaboration: string; workspace: string; checklist: string; maintenance: string; rules: string; code: string };
    overview: { title: string; body: string; callout: string };
    media: { title: string; body: string; caption: string };
    next: { previous: string; next: string; start: string; workspace: string };
  };
  hero: { eyebrow: string; title: string; lead: string; primary: string; secondary: string; facts: string[]; screenshot: string };
  before: { eyebrow: string; title: string; lead: string; items: Array<{ mark: string; title: string; body: string }> };
  path: { eyebrow: string; title: string; lead: string; steps: Array<{ title: string; body: string }> };
  collaboration: { eyebrow: string; title: string; lead: string; note: string; steps: Array<{ title: string; body: string }>; images: Array<{ src: string; alt: string; title: string; body: string }> };
  workflow: { eyebrow: string; title: string; lead: string; steps: Array<{ title: string; body: string }> };
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
    nav: [["加入协作", "collaboration"], ["工作流", "workflow"], ["规则", "rules"], ["开源协作", "code"]],
    docs: {
      label: "贡献文档",
      breadcrumb: "内容贡献",
      updated: "最后更新：2026-08-19",
      sidebar: { gettingStarted: "开始贡献", workspace: "后台工作台", publishing: "发布与维护", overview: "概述", prepare: "开始前确认", path: "协作路径", collaboration: "加入字幕协作", directory: "目录结构", course: "课程管理", workbench: "制课工作台", subtitles: "导入字幕", waveform: "波形与翻译", publish: "提交与发布", checklist: "发布前检查", maintenance: "发布后维护", rules: "内容与授权规则", code: "代码贡献" },
      toc: { overview: "概述", start: "开始贡献内容", collaboration: "加入字幕协作", workspace: "后台工作台", checklist: "发布前检查", maintenance: "发布后维护", rules: "内容与授权规则", code: "代码贡献" },
      overview: { title: "用真实媒体，贡献真正能练的听力课。", body: "DuolinTing 将真实世界的音视频组织成泛听、逐句精听与难点复习。现在，获得课程权限的字幕贡献者可以直接在后台完成校对或二审；你的名字也会显示在课程中。", callout: "内容工作台由维护者配置账号与课程权限；目前没有公开投稿表单或自助开通入口。" },
      media: { title: "课程制作的核心，是逐句准确。", body: "媒体、字幕时间轴、译文和可接受答案会共同决定学习者的体验。请把每一句当作一段独立的练习：听得到、对得上、看得懂，也有合理的答案边界。", caption: "制课工作台：上传媒体、逐句校准波形与字幕，然后保存或发布。" },
      next: { previous: "上一节", next: "下一节", start: "开始前确认", workspace: "后台工作台" },
    },
    hero: {
      eyebrow: "DuolinTing 贡献指南",
      title: "把你有权使用的真实媒体，做成一门能反复练的听力课。",
      lead: "这份指南带你从素材准备走到发布与维护：上传音视频、导入字幕、在波形上校准每一句，再把课程交给学习者。",
      primary: "查看制作路径",
      secondary: "前往 GitHub",
      facts: ["仅上传有权使用的内容", "课程由超级管理员按任务分配", "校对与二审贡献会在课程页面署名"],
      screenshot: "DuolinTing 制课工作台的媒体、波形与字幕编辑界面",
    },
    before: {
      eyebrow: "开始前，先确认三件事",
      title: "好课程来自准确素材，也来自清楚的边界。",
      lead: "我们希望贡献者把精力花在真正可发布、可复习的课程上。先完成以下确认，再进入工作台。",
      items: [
        { mark: "01", title: "你拥有内容使用权", body: "音频、视频、字幕、封面和译文都必须由你创作、已获授权，或采用允许此用途的明确开放许可。保留来源、许可和必要的署名信息。" },
        { mark: "02", title: "你已获得协作权限", body: "内容工作台目前只向由维护者配置的字幕贡献者账号开放。请提供一个常用邮箱和希望展示的名字；维护者会私聊发送一次性的登录信息，并将指定课程分配给你。" },
        { mark: "03", title: "你愿意为质量负责", body: "AI 可以协助翻译，但不能替代核对。发布前请亲自听完媒体、检查每一条时间轴和所有面向学习者的文本。" },
      ],
    },
    path: {
      eyebrow: "从素材到课程",
      title: "一门课程，沿着这 8 步完成。",
      lead: "推荐按这个顺序工作。这样目录、媒体、字幕和发布状态始终清楚，不会在最后阶段反复返工。",
      steps: [
        { title: "准备素材", body: "整理已获权利的媒体、原始字幕、来源说明与封面素材。" },
        { title: "开通字幕贡献者账号", body: "向维护者提供邮箱和用于课程署名的显示名称；登录信息会通过私聊一次性发送。" },
        { title: "领取已分配课程", body: "超级管理员会把指定课程的校对或二审工作分配给你；贡献者只可编辑已获授权的课程。" },
        { title: "校对字幕", body: "在工作台逐句校准文本、时间轴、译文与可接受答案，完成后提交二审。" },
        { title: "二次审核", body: "二审人核对已提交字幕，选择通过或退回；退回后校对人才能修改并重新提交。" },
        { title: "由管理员发布", body: "通过二审后由超级管理员控制发布。草稿与已校对内容仅向获志愿者预览权限的学习端成员开放。" },
      ],
    },
    collaboration: {
      eyebrow: "和我们一起做课",
      title: "现在，字幕贡献可以直接在 Admin 工作台完成。",
      lead: "感谢已经加入的四位伙伴，也感谢每一位愿意投入时间的人。此前部分伙伴需要用剪辑软件修改字幕后再回传，过程容易反复。现在课程权限与任务分发已接入后台：拿到账号和课程后，就可以直接参与建设。",
      note: "账号开通目前不使用邮箱验证码。因为协作人数还很少，我们采用互相信任的方式：请把常用邮箱和显示名称发给维护者；显示名称会用于课程公开署名。",
      steps: [
        { title: "提供邮箱与显示名称", body: "通过邮件或其他约定渠道，把常用邮箱和希望展示在产品中的名字发给维护者。" },
        { title: "收到一次性登录信息", body: "超级管理员创建字幕贡献者账号后，临时密码只显示一次，并会通过私聊安全发送；首次登录必须立即修改密码。" },
        { title: "获得指定课程权限", body: "维护者会为课程指定校对人和二审人。两项职责通常由不同的人承担，也可以由同一位贡献者完成。" },
        { title: "在工作台完成任务", body: "校对人修改后提交二审，提交即锁定，不能重复提交；二审人通过或退回。通过后的课程由超级管理员发布。" },
      ],
      images: [
        { src: "/contributor-account-provisioning.png", alt: "Admin 中添加字幕贡献者账号的表单", title: "账号由超级管理员开通", body: "使用邮箱登录，并填写会出现在课程中的显示名称。" },
        { src: "/contributor-first-login.png", alt: "一次性显示的字幕贡献者账号开通信息", title: "登录信息仅展示一次", body: "临时密码不会保存在后台；请立即安全发送给成员。" },
        { src: "/contributor-course-credit.png", alt: "课程标题栏中显示校对与审核贡献者名称", title: "贡献会被公开署名", body: "校对与审核人的显示名称会在网页和 App 的课程标题区域展示。" },
      ],
    },
    workflow: {
      eyebrow: "字幕工作流",
      title: "四步完成一次协作。",
      lead: "超级管理员管理课程与发布；字幕贡献者专注于校对和二审。",
      steps: [
        { title: "草稿", body: "管理员创建课程并分配校对人与二审人。" },
        { title: "校对", body: "校对人直接在 Admin 工作台修改字幕。" },
        { title: "二次审核", body: "提交后字幕锁定，流转给指定审核人通过或退回。" },
        { title: "发布", body: "管理员确认后发布；草稿与已校对内容仅供志愿者预览。" },
      ],
    },
    workspace: {
      eyebrow: "后台工作台，逐步操作",
      title: "用真实的制课流程，把一段媒体组织成练习。",
      lead: "管理员后台不是公开投稿工具，而是受控的内容生产工作台。以下名称与操作对应现有工作区。",
      note: "提示：状态沿着“草稿 → 已校对 → 二次审核 / 发布”流转。草稿和已校对课程可供获志愿者预览权限的学习端成员查看；已发布课程对所有学习者可见。",
      sections: [
        {
          id: "directory", number: "01", title: "目录结构：由超级管理员维护课程位置", intro: "超级管理员在“目录结构”建立学习者看得到的内容层级。字幕贡献者不需要处理目录，只需进入自己已分配的课程。",
          actions: ["新建内容分类，填写名称、说明、颜色和可选封面。", "在分类下新建学习系列，明确课程面向的主题、难度或学习路径。", "补齐英语、泰语、日语本地化。可使用 AI 辅助填充，但发布前必须人工检查词义与表达。"],
          aside: { title: "先目录，后课程", body: "课程管理需要已有学习系列。若还没有分类或学习系列，先回到“目录结构”创建。" },
        },
        {
          id: "course", number: "02", title: "课程管理：查看任务并分配负责人", intro: "超级管理员在这里创建课程、管理发布状态，并为每门课程指定校对人与二审人。字幕贡献者只会看到获授权或分配到自己名下的课程。",
          actions: ["为课程分别选择校对负责人和二审负责人；两项角色可以由不同人或同一人担任。", "创建、发布、归档课程由超级管理员控制；贡献者专注于字幕校对和二审。", "课程会清楚显示当前状态、负责人和审核人，方便协作跟进。"],
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
          id: "publish", number: "06", title: "提交二审与发布：由任务状态推动课程", intro: "校对人保存修改后提交二审。提交后的字幕稿会锁定并流转给提交时指定的二审人；只有超级管理员能控制课程发布。",
          actions: ["校对完成后提交二审；同一稿件不能重复提交或在提交后继续编辑。", "二审人可通过或退回并附上意见；只有退回后，校对人才能修改并再次提交。", "二审完成后，超级管理员确认内容和状态，再将课程发布给全体学习者。"],
        },
      ],
    },
    checklist: {
      eyebrow: "发布前检查",
      title: "在点下“发布”前，逐项打勾。",
      lead: "下面每一项都直接影响学习者能否顺畅完成泛听、逐句精听和难点复习。",
      items: ["我对媒体、字幕、封面、翻译和其他素材拥有必要的使用权，并已保留来源与署名要求。", "媒体可以完整播放，内容、课程标题、来源和所属学习系列完全对应。", "字幕的每句文本准确，起止时间与实际语音对齐；开头、中段和结尾都已试听。", "中文、泰语、日语译文及本地化标题／摘要已人工复核，AI 生成内容没有直接跳过检查。", "每句的可接受答案足以覆盖合理表达，同时不会把错误答案误判为正确。", "校对已提交二审，二审意见已处理；超级管理员已确认课程状态与发布范围。"],
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
    nav: [["Join collaboration", "collaboration"], ["Workflow", "workflow"], ["Rules", "rules"], ["Open source", "code"]],
    docs: {
      label: "Contribution docs",
      breadcrumb: "Content contributions",
      updated: "Last updated: August 19, 2026",
      sidebar: { gettingStarted: "Getting started", workspace: "Admin workspace", publishing: "Publish and maintain", overview: "Overview", prepare: "Before you begin", path: "Collaboration path", collaboration: "Join subtitle collaboration", directory: "Catalogue structure", course: "Course management", workbench: "Creation workspace", subtitles: "Import subtitles", waveform: "Waveform and translation", publish: "Submit and publish", checklist: "Publish checks", maintenance: "Maintain lessons", rules: "Content and rights", code: "Code contributions" },
      toc: { overview: "Overview", start: "Start contributing", collaboration: "Join subtitle collaboration", workspace: "Admin workspace", checklist: "Publish checks", maintenance: "Maintain lessons", rules: "Content and rights", code: "Code contributions" },
      overview: { title: "Use real media to contribute listening lessons people can truly practice.", body: "DuolinTing organizes real-world audio and video into warm-up listening, line-by-line practice, and difficult-line review. Subtitle contributors with course access can now proofread or review directly in Admin—and receive public course credit for that work.", callout: "Maintainers configure content accounts and course permissions. There is currently no public submission form or self-service account creation." },
      media: { title: "Accurate lines are the heart of lesson production.", body: "Media, subtitle timing, translations, and accepted answers work together to shape a learner’s experience. Treat every line as a practice unit: hearable, precisely aligned, understandable, and bounded by reasonable answers.", caption: "Creation workspace: upload media, align waveform and subtitles line by line, then save or publish." },
      next: { previous: "Previous", next: "Next", start: "Before you begin", workspace: "Admin workspace" },
    },
    hero: {
      eyebrow: "DuolinTing contribution guide",
      title: "Turn real media you have the right to use into a listening lesson worth repeating.",
      lead: "This guide takes you from source preparation through publishing and maintenance: upload media, import subtitles, align every line on the waveform, then share the lesson with learners.",
      primary: "See the creation path",
      secondary: "Visit GitHub",
      facts: ["Upload only content you have the right to use", "Course work is assigned by a super administrator", "Proofread and review work receives public course credit"],
      screenshot: "DuolinTing creation workspace showing media, waveform, and subtitles",
    },
    before: {
      eyebrow: "Before you begin",
      title: "Strong lessons need accurate source material and clear boundaries.",
      lead: "We want contributors to spend their energy on lessons that can genuinely be published and practiced. Confirm these points before opening the workspace.",
      items: [
        { mark: "01", title: "You have the rights to the material", body: "Audio, video, subtitles, cover art, and translations must be yours, licensed to you, or covered by a clear open licence that permits this use. Keep source, licence, and attribution details." },
        { mark: "02", title: "You have collaboration access", body: "The content workspace is available to subtitle-contributor accounts configured by maintainers. Send a preferred email and the name you want shown on courses; a maintainer will privately send your one-time login details and assign a course." },
        { mark: "03", title: "You will own the quality check", body: "AI can help with translation, but it cannot replace review. Before publishing, listen through the media and check every timeline entry and learner-facing text yourself." },
      ],
    },
    path: {
      eyebrow: "From source to lesson",
      title: "A lesson comes together in eight clear steps.",
      lead: "This order keeps the catalogue, media, subtitles, and release status clear—without late-stage rework.",
      steps: [
        { title: "Prepare source material", body: "Gather rights-cleared media, source subtitles, attribution details, and cover assets." },
        { title: "Get a subtitle-contributor account", body: "Send a maintainer your email and the display name you want credited on courses; login details are privately shared once." },
        { title: "Open your assigned course", body: "A super administrator assigns you as proofreader or second reviewer. Contributors can edit only courses they are allowed to access." },
        { title: "Proofread subtitles", body: "Use the workspace to align text, timing, translations, and accepted answers, then submit the work for second review." },
        { title: "Complete second review", body: "The reviewer approves or returns the submitted draft. A returned draft can be edited and resubmitted by the proofreader." },
        { title: "An administrator publishes", body: "After review, a super administrator controls release. Draft and proofread content is available only to learner accounts granted volunteer-preview access." },
      ],
    },
    collaboration: {
      eyebrow: "Build lessons with us",
      title: "Subtitle collaboration now happens directly in the Admin workspace.",
      lead: "Thank you to the four people already contributing—and to everyone considering it. Earlier contributors edited subtitles in video software and sent files back, which created unnecessary handoffs. Course permissions and task assignment now make that work possible directly inside Admin.",
      note: "We do not currently use email verification. Our small group works on trust: send a maintainer an email you use and the name you want publicly credited under. That name appears on the course.",
      steps: [
        { title: "Share an email and display name", body: "Use email or another agreed channel to send a maintainer your preferred email and the name you want shown in the product." },
        { title: "Receive one-time login details", body: "A super administrator creates your subtitle-contributor account. The temporary password is shown once and sent privately; you must change it on first login." },
        { title: "Receive course access", body: "A maintainer assigns proofreader and second-reviewer roles per course. These are usually separate people, but may be the same contributor." },
        { title: "Finish work in the workspace", body: "Proofreaders submit to second review; submission locks the draft and cannot be repeated. Reviewers approve or return it. A super administrator publishes approved content." },
      ],
      images: [
        { src: "/contributor-account-provisioning.png", alt: "Admin form for adding a subtitle contributor", title: "Accounts are provisioned by a super administrator", body: "Contributors sign in by email and choose the display name shown on courses." },
        { src: "/contributor-first-login.png", alt: "One-time subtitle contributor account details", title: "Login details are shown only once", body: "Temporary passwords are not retained by Admin; send them securely right away." },
        { src: "/contributor-course-credit.png", alt: "Course title area showing proofreader and reviewer names", title: "Contributors receive visible credit", body: "Proofreader and reviewer display names appear in the course title area on web and mobile." },
      ],
    },
    workflow: {
      eyebrow: "Subtitle workflow",
      title: "Four steps for every collaboration.",
      lead: "Super administrators manage courses and release; subtitle contributors focus on proofreading and second review.",
      steps: [
        { title: "Draft", body: "An administrator creates the lesson and assigns the proofreader and reviewer." },
        { title: "Proofread", body: "The proofreader edits subtitles directly in the Admin workspace." },
        { title: "Second review", body: "Submission locks the draft and sends it to the assigned reviewer to approve or return." },
        { title: "Publish", body: "An administrator releases approved work; draft and proofread content is for volunteer preview only." },
      ],
    },
    workspace: {
      eyebrow: "The admin workspace, step by step",
      title: "Turn a piece of real media into practice through the production workflow.",
      lead: "The admin area is a controlled content-production workspace, not a public upload form. These labels and actions match the current workspace.",
      note: "Note: course state flows through Draft → Proofread → Second review / Published. Draft and proofread lessons can be viewed by learner accounts granted volunteer-preview access; published lessons are available to everyone.",
      sections: [
        { id: "directory", number: "01", title: "Catalogue structure: super administrators maintain lesson placement", intro: "Super administrators use Catalogue structure to create the hierarchy learners see. Subtitle contributors do not need to manage it: they open the courses assigned to them.", actions: ["Create a content category with its name, description, colour, and optional cover.", "Create a learning series inside that category and define the topic, level, or learning path it represents.", "Complete English, Thai, and Japanese localization. AI can help fill fields, but a person must check wording and meaning before publishing."], aside: { title: "Catalogue before lessons", body: "Course management needs an existing learning series. If no category or series exists, create it in Catalogue structure first." } },
        { id: "course", number: "02", title: "Course management: find work and assign owners", intro: "Super administrators create lessons, manage release status, and select a proofreader and second reviewer for every course. Subtitle contributors see only courses that they are assigned or authorized to access.", actions: ["Choose a proofreader and a second reviewer separately; they may be different people or the same contributor.", "Course creation, publishing, and archiving are controlled by super administrators; contributors focus on proofreading and reviewing subtitles.", "Course rows make the current state, proofreader, and reviewer clear for the whole collaboration." ] },
        { id: "workbench", number: "03", title: "Creation workspace: upload the media and build practice", intro: "The Creation workspace puts course details, media, and subtitles into one editing flow. Before saving, a media item, learning series, and lesson title are required.", actions: ["Upload audio or video. The workspace accepts audio/video files and currently checks a 120 MB maximum before upload; compress or split larger files.", "Complete series, title, difficulty, status, source, summary, and localized title/summary fields. The course cover is optional.", "After uploading or replacing media, listen through it and make sure the file, duration, and lesson all match."], aside: { title: "Start as a draft", body: "Choose Draft while media, subtitles, and translations are still being edited. Switch to Published only after you have reviewed everything." } },
        { id: "subtitles", number: "04", title: "Import subtitles: turn source material into editable lines", intro: "The workspace imports subtitle files or pasted subtitle text. Imported entries are drafts; they still need a line-by-line check against the media.", actions: ["Import .srt, .vtt, .ass, .lrc, or .txt files, or paste subtitle text directly.", "Bilingual subtitles can be recognized as two-line structures; choose whether Chinese appears on the first or second line.", "For a whole-track adjustment, use the global time offset in milliseconds, then sample the beginning, middle, and end." ] },
        { id: "waveform", number: "05", title: "Waveform and translation: make every line genuinely practiceable", intro: "Work line by line on the waveform and timeline. Learners’ looping, dictation, and review all depend on accurate timing and text.", actions: ["Drag or zoom the waveform to adjust each segment’s start and end, or use Set start / Set end for precise points.", "Add a line, merge with the next line, delete a wrong segment, or apply a batch timing offset when needed.", "Complete source text, translations, and accepted answers for every line. AI can fill or retranslate Chinese, Thai, and Japanese, but every line needs human listening and review."], aside: { title: "Timing standard", body: "Each segment should closely match the spoken range: do not cut off word beginnings or endings, and do not combine two lines that should be practiced separately." } },
        { id: "publish", number: "06", title: "Submit for review and publish: let task state move the course", intro: "After proofreading, submit the work for second review. Submitted subtitles lock and go to the reviewer chosen at submission time; only a super administrator controls publishing.", actions: ["Submit for second review when proofreading is complete; the same draft cannot be submitted again or edited after submission.", "A second reviewer can approve or return the work with a note; only returned work can be edited and resubmitted by the proofreader.", "After second review, a super administrator verifies the content and state, then publishes the lesson for all learners." ] },
      ],
    },
    checklist: { eyebrow: "Publish checks", title: "Before selecting Published, check every item.", lead: "Each item directly affects whether a learner can warm up, practice line by line, and review difficult parts without friction.", items: ["I have the rights needed for the media, subtitles, cover, translations, and other assets, and I retained source and attribution requirements.", "The media plays through; its content matches the lesson title, source, and learning series.", "Every subtitle is accurate and aligned with spoken audio; I sampled the beginning, middle, and end.", "Chinese, Thai, and Japanese translations plus localized titles/summaries were reviewed by a person; no AI output was published unchecked.", "Accepted answers cover reasonable responses without incorrectly treating wrong answers as correct.", "Proofreading was submitted for second review, review feedback was addressed, and a super administrator confirmed the course state and release audience."], button: "Back to workspace steps" },
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
            <a href="#collaboration">{docs.sidebar.collaboration}</a>
            <a href="#workflow">{locale === "zh" ? "字幕工作流" : "Subtitle workflow"}</a>
            <p>{docs.sidebar.publishing}</p>
            <a href="#rules">{docs.sidebar.rules}</a>
            <a href="#code">{docs.sidebar.code}</a>
          </nav>
          <a className="docs-github-link" href={githubUrl} target="_blank" rel="noreferrer"><span>&lt;/&gt;</span>{t.code.action}</a>
        </aside>

        <article className="docs-article">
          <div className="docs-breadcrumb"><Link href={initialLocale === "en" ? "/en" : "/"}>DuolinTing</Link><span>/</span><span>{docs.breadcrumb}</span><time dateTime="2026-08-19">{docs.updated}</time></div>
          <section id="overview" className="docs-intro">
            <p className="docs-kicker">{t.hero.eyebrow}</p>
            <h1>{docs.overview.title}</h1>
            <p className="docs-lead">{docs.overview.body}</p>
            <p className="docs-callout"><span>i</span>{docs.overview.callout}</p>
            <ul className="docs-facts">{t.hero.facts.map((fact) => <li key={fact}><span>✓</span>{fact}</li>)}</ul>
          </section>

          <section id="collaboration" className="docs-section docs-collaboration-section">
            <p className="docs-section-label">{t.collaboration.eyebrow}</p><h2>{t.collaboration.title}</h2><p>{t.collaboration.lead}</p>
            <p className="docs-callout"><span>i</span>{t.collaboration.note}</p>
            <ol className="docs-numbered-list">{t.collaboration.steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
            <div className="docs-collaboration-media">{t.collaboration.images.map((image) => <figure key={image.src}><Image src={image.src} alt={image.alt} width={1024} height={824} sizes="(max-width: 820px) 100vw, 360px" /><figcaption><strong>{image.title}</strong><span>{image.body}</span></figcaption></figure>)}</div>
          </section>

          <section id="workflow" className="docs-section"><p className="docs-section-label">{t.workflow.eyebrow}</p><h2>{t.workflow.title}</h2><p>{t.workflow.lead}</p><ol className="docs-path-list">{t.workflow.steps.map((step, index) => <li key={step.title}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol></section>

          <section className="docs-section" id="rules"><p className="docs-section-label">{t.rules.eyebrow}</p><h2>{t.rules.title}</h2><p>{t.rules.lead}</p><ul className="docs-rules-list">{t.rules.items.map((item) => <li key={item}><span>!</span>{item}</li>)}</ul></section>

          <section className="docs-section" id="code"><p className="docs-section-label">{t.code.eyebrow}</p><h2>{t.code.title}</h2><p>{t.code.body}</p><a className="docs-action" href={githubUrl} target="_blank" rel="noreferrer">{t.code.action}<span>↗</span></a><p className="docs-fine-print">{t.code.note}</p></section>
          <nav className="docs-pagination" aria-label="Contribution guide pagination"><a href="#collaboration"><small>{docs.next.previous}</small><strong>← {docs.sidebar.collaboration}</strong></a><a href="#workflow"><small>{docs.next.next}</small><strong>{t.workflow.title} →</strong></a></nav>
        </article>

        <aside className="docs-toc" aria-label="On this page"><p>{locale === "zh" ? "本页总览" : "On this page"}</p><nav><a href="#overview">{docs.toc.overview}</a><a href="#collaboration">{docs.toc.collaboration}</a><a href="#workflow">{t.workflow.eyebrow}</a><a href="#rules">{docs.toc.rules}</a><a href="#code">{docs.toc.code}</a></nav></aside>
      </div>
    </main>
  );
}
