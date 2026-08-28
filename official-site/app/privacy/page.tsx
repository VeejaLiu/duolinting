import type { Metadata } from "next";
import Link from "next/link";
import { localizedAlternates } from "../content/site-url";

export const metadata: Metadata = {
  title: "隐私政策",
  description: "DuolinTing 多邻听官网与学习产品的隐私政策。",
  alternates: localizedAlternates("/privacy"),
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <header className="site-header">
        <div className="site-shell header-inner">
          <Link className="brand" href="/"><span><strong>DuolinTing</strong><small>多邻听</small></span></Link>
          <Link className="header-cta" href="/">返回首页</Link>
        </div>
      </header>
      <article className="site-shell legal-content">
        <p className="eyebrow"><span></span>隐私政策</p>
        <h1>我们只处理提供多邻听所需的数据。</h1>
        <p className="legal-updated">最后更新：2026-08-29</p>

        <h2>运营主体与联系方式</h2>
        <p>DuolinTing（多邻听）是由 Veeja Liu 作为个人开发者维护的独立开源项目。隐私问题、数据请求和账号问题可以通过 <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> 联系维护者，也可以查看<a href="/support">支持页面</a>中的其他联系方式。</p>

        <h2>我们处理哪些数据</h2>
        <ul className="legal-list">
          <li><strong>账号信息：</strong>注册和登录时使用的邮箱、显示名称，以及用于验证密码的加密密码摘要。我们不会以明文保存密码。</li>
          <li><strong>学习数据：</strong>课程进度、句子掌握状态、重复次数、听写、笔记、生词、学习偏好、每日活动和答案反馈。</li>
          <li><strong>会话与安全数据：</strong>登录会话的令牌摘要、客户端类型、创建和到期时间，用于保持登录状态、撤销会话和防止滥用。</li>
          <li><strong>运行日志：</strong>服务会记录请求编号、请求方法和路径、响应状态、耗时、来源地址和数据量，用于安全监控、故障排查和服务运维。</li>
        </ul>

        <h2>我们如何使用数据</h2>
        <p>账号信息用于注册、登录和显示账号；学习数据用于跨设备保存和恢复学习进度；会话与运行日志用于身份验证、限流、安全防护和排查故障。我们不会出售个人信息，也不会使用广告网络进行定向广告。</p>

        <h2>数据共享与第三方服务</h2>
        <p>数据会在提供服务所需的服务器、数据库、对象存储和日志运行环境中处理。维护者只授予完成运维、修复故障和保护服务所需的访问权限。当前官网没有接入广告 SDK 或第三方分析 SDK；如果以后增加会收集个人数据的服务，我们会先更新本政策，说明其用途和共享范围。</p>

        <h2>数据保留</h2>
        <ul className="legal-list">
          <li>账号信息和学习数据会在账号存续期间保留，以便提供登录和学习同步功能。</li>
          <li>登录会话会在到期、被撤销或账号删除时失效并清除。</li>
          <li>运行日志不会作为用户学习档案长期保留；它们只在安全和运维需要的期间保留，并按照部署环境的滚动或删除策略覆盖。</li>
          <li>法律要求必须保留的记录，只在法定期限内保留，并限制为履行该义务所需的范围。</li>
        </ul>

        <h2>删除账号与数据</h2>
        <p>已登录用户可以在 App 的“设置 → 删除账号”中输入当前密码并发起删除。删除成功后，账号、登录会话、课程进度、句子进度、生词、笔记、活动记录、偏好和答案反馈等账号级数据会从服务端删除；如果账号同时关联内容协作身份，该关联会被解除，但不会删除由该身份参与维护的公共课程内容。</p>
        <p>如果无法登录，可以从<a href="/support">支持页面</a>联系维护者申请数据删除。请不要在邮件中发送密码；为了核验请求，维护者可能需要确认账号邮箱和其他必要信息。</p>

        <h2>你的权利</h2>
        <p>你可以请求了解、修改或删除与你的账号相关的数据，也可以就隐私处理提出疑问。请通过 <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> 联系我们；我们会在核验请求后处理。</p>

        <h2>政策更新</h2>
        <p>如果产品的数据处理方式发生重大变化，我们会在本页面更新版本日期和相关说明。继续使用服务表示你已看到更新后的政策。</p>

        <p className="legal-links"><Link href="/support">支持页面</Link> · <Link href="/terms">使用条款</Link> · <Link href="/">返回首页</Link></p>
      </article>
    </main>
  );
}
