import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "使用条款",
  description: "DuolinTing 多邻听使用条款与开源许可说明。",
  alternates: localizedAlternates("/terms"),
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <Link className="header-cta" href="/">返回首页</Link>
        </div>
      </header>
      <article className="site-shell legal-content">
        <p className="eyebrow"><span></span>使用条款</p>
        <h1>尊重内容权利，也尊重学习者。</h1>
        <p className="legal-updated">最后更新：2026-08-29</p>

        <h2>运营主体与联系方式</h2>
        <p>DuolinTing（多邻听）是由 Veeja Liu 作为个人开发者维护的独立开源项目。关于本条款、服务使用或内容权利的问题，请发送邮件至 <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a>，或查看<a href="/support">支持页面</a>。</p>

        <h2>服务与账号</h2>
        <p>DuolinTing 提供真实音视频的听力练习、课程目录、学习进度同步和内容制作工具。你可以在支持的平台上注册账号；请提供准确的信息并妥善保管密码。账号仅供本人使用，不要与他人共享登录凭据。</p>

        <h2>内容权利与使用规则</h2>
        <ul className="legal-list">
          <li>你上传、导入、发布或分享的音频、视频、字幕、封面、翻译和其他材料，必须由你创作、已获授权，或受到允许此用途的开放许可覆盖。</li>
          <li>你不得上传或分发侵犯他人著作权、商标权、隐私权或其他合法权益的内容，也不得规避内容所有者设置的访问限制。</li>
          <li>你不得抓取、复制或重新分发 YouZack 整理的配套字幕。DuolinTing 是受其听力学习理念启发的独立项目，并非 YouZack 官方产品。</li>
          <li>维护者可以为了安全、合规、质量或服务运行，对违规内容进行限制、隐藏或删除。</li>
        </ul>

        <h2>开源许可</h2>
        <p>DuolinTing 源代码以 Apache-2.0 许可证发布。使用、修改和分发源代码时，请遵守仓库中的许可证和通知要求。开源许可不代表你获得第三方媒体、字幕或其他内容的使用权。</p>

        <h2>学习数据与账号删除</h2>
        <p>学习进度、听写、笔记、生词和其他账号数据按照<a href="/privacy">隐私政策</a>处理。你可以在 App 的“设置 → 删除账号”中发起删除；无法登录时，可以通过<a href="/support">支持页面</a>联系维护者。删除账号不会自动删除由你参与维护的公共课程内容，但会解除内容协作身份与学习账号的关联。</p>

        <h2>服务可用性</h2>
        <p>我们会尽力保持服务稳定，但不保证服务持续、无错误或始终可用。维护者可能为了安全、升级、修复或内容审核暂时限制部分功能。请不要把服务作为唯一的数据备份；重要的个人内容应自行保存。</p>

        <h2>反馈与改进建议</h2>
        <p>如果你提交问题、建议或内容反馈，你同意维护者可以在提供和改进服务所需的范围内使用这些信息。反馈中请不要提交密码、支付信息或其他不必要的敏感信息。</p>

        <h2>条款变更与争议处理</h2>
        <p>我们会在本页面更新条款的版本日期。条款变更后继续使用服务，即表示你有机会查看更新内容。有关服务的争议应先通过 <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> 友好协商；协商不成时，提交有管辖权的法院处理，并以适用于该争议的强制性法律为准。</p>

        <p className="legal-links"><Link href="/privacy">隐私政策</Link> · <Link href="/support">支持页面</Link> · <Link href="/">返回首页</Link></p>
      </article>
    </main>
  );
}
