import Link from "next/link";

export const metadata = {
  title: "隐私说明",
  description: "DuolinTing 官网与产品隐私说明。",
  alternates: { canonical: "/privacy", languages: { "zh-CN": "/privacy", en: "/en/privacy" } },
};

export default function PrivacyPage() {
  return <main className="legal-page"><header className="site-header"><div className="site-shell header-inner"><Link className="brand" href="/"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link><Link className="header-cta" href="/">返回首页</Link></div></header><article className="site-shell legal-content"><p className="eyebrow"><span></span>隐私说明</p><h1>我们只处理让产品正常运作所需的数据。</h1><p className="legal-updated">最后更新：2026-08-15</p><h2>官网</h2><p>官网用于介绍 DuolinTing、提供下载说明和指向产品入口的链接。官网默认不要求创建账户；如后续接入分析或表单，会在上线前更新本说明并明确说明收集目的。</p><h2>学习产品</h2><p>注册和登录会处理账号身份信息。为提供学习体验，产品会保存课程进度、句子掌握状态、重复次数、听写、笔记和生词等学习数据；这些数据按登录用户隔离保存。管理员与学习者使用独立的会话与权限。</p><h2>下载与安全</h2><p>Android APK 只会通过官方 HTTPS 下载地址发布。下载页提供版本和 SHA-256 校验值，帮助用户验证文件完整性。官网不会要求用户关闭系统级安全保护。</p><h2>需要补充的公开信息</h2><p>在对外正式发布前，请补充负责运营主体、隐私咨询联系方式、数据保留期限和适用地区要求。此页面是产品现状的透明说明，不替代针对特定司法辖区的法律意见。</p></article></main>;
}
