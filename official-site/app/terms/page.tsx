import Link from "next/link";

export const metadata = {
  title: "使用条款",
  description: "DuolinTing 使用条款与开源许可说明。",
  alternates: { canonical: "/terms", languages: { "zh-CN": "/terms", en: "/en/terms" } },
};

export default function TermsPage() {
  return <main className="legal-page"><header className="site-header"><div className="site-shell header-inner"><Link className="brand" href="/"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link><Link className="header-cta" href="/">返回首页</Link></div></header><article className="site-shell legal-content"><p className="eyebrow"><span></span>使用条款</p><h1>尊重内容权利，也尊重学习者。</h1><p className="legal-updated">最后更新：2026-08-15</p><h2>产品用途</h2><p>DuolinTing 用于组织真实音视频的听力学习与课程制作。请遵守适用法律，并确保你对上传、导入、发布或分享的媒体、字幕、封面和翻译拥有必要的权利或授权。</p><h2>内容来源</h2><p>项目不会抓取或复制 YouZack 整理的配套字幕。DuolinTing 是受其听力学习理念启发的独立开源项目，并非 YouZack 官方产品，也不代表获得其官方背书。</p><h2>开源许可</h2><p>DuolinTing 源代码以 Apache-2.0 发布。使用、修改和分发源代码时，请遵守仓库中的许可证文件与通知要求。</p><h2>需要补充的公开信息</h2><p>在对外正式发布前，请补充负责运营主体、联系渠道、适用法律与争议处理条款。本页面是官网首版的产品使用说明，不替代法律意见。</p></article></main>;
}
