import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "支持与联系",
  description: "DuolinTing 多邻听的安装、账号、学习和隐私支持联系方式。",
  alternates: localizedAlternates("/support"),
};

export default function SupportPage() {
  return (
    <main className="legal-page">
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <Link className="header-cta" href="/">返回首页</Link>
        </div>
      </header>
      <article className="site-shell legal-content">
        <p className="eyebrow"><span></span>支持与联系</p>
        <h1>遇到问题，直接联系我们。</h1>
        <p className="legal-updated">最后更新：2026-08-29</p>

        <h2>运营主体</h2>
        <p>DuolinTing（多邻听）是由 Veeja Liu 作为个人开发者维护的独立开源项目。</p>

        <h2>主要联系方式</h2>
        <ul className="legal-list">
          <li><strong>电子邮箱：</strong><a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a>（安装、登录、同步、账号删除、隐私和功能反馈）</li>
          <li><strong>电话 / 微信：</strong><a href="tel:+8615352290342">+86 153 5229 0342</a>（微信同号）</li>
          <li><strong>QQ：</strong><span className="contact-value">1209898373</span></li>
          <li><strong>Discord：</strong><a href="https://discord.com/users/924180303487066182" target="_blank" rel="noreferrer">DuolinTing maintainer</a></li>
          <li><strong>源代码与问题反馈：</strong><a href="https://github.com/VeejaLiu/duolinting" target="_blank" rel="noreferrer">GitHub 仓库</a></li>
        </ul>

        <h2>我们可以帮助什么</h2>
        <ul className="legal-list">
          <li>App 安装、启动、登录、注册和跨设备同步问题。</li>
          <li>课程播放、字幕、翻译、学习进度和答案反馈问题。</li>
          <li>账号访问、账号删除、数据访问或隐私请求。</li>
          <li>内容来源、版权和课程贡献相关问题。</li>
        </ul>

        <h2>提交请求时请提供</h2>
        <p>请说明你使用的平台（iPhone、Android、Web）、App 版本、问题发生的步骤和可复现现象。账号问题只需提供账号邮箱；不要发送密码、验证码、支付信息或其他不必要的敏感信息。</p>

        <h2>账号删除</h2>
        <p>登录后可以在 App 的“设置 → 删除账号”中输入当前密码并删除账号。无法登录时，可以通过上面的邮箱申请删除；维护者会先核验请求，再删除账号及账号级学习数据。更多说明请查看<a href="/privacy">隐私政策</a>。</p>

        <p className="legal-links"><Link href="/privacy">隐私政策</Link> · <Link href="/terms">使用条款</Link> · <Link href="/">返回首页</Link></p>
      </article>
    </main>
  );
}
