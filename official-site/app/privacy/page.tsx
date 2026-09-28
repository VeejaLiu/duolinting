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
        <p className="legal-updated">最后更新：2026-09-28</p>

        <h2>运营主体与联系方式</h2>
        <p>DuolinTing（多邻听）是由 Veeja Liu 作为个人开发者维护的独立开源项目。隐私问题、数据请求和账号问题可以通过 <a href="mailto:veejaliu@outlook.com">veejaliu@outlook.com</a> 联系维护者，也可以查看<a href="/support">支持页面</a>中的其他联系方式。</p>

        <h2>我们处理哪些数据</h2>
        <ul className="legal-list">
          <li><strong>账号信息：</strong>邮箱登录时使用的邮箱、显示名称；只有主动设置密码时才保存用于验证的密码摘要。Apple 或 Google 登录的账号可以没有邮箱登录地址或密码，我们不会保存明文密码。</li>
          <li><strong>第三方登录信息：</strong>选择 Apple 或 Google 登录时，我们记录服务提供方、其稳定账号标识、签发方、客户端标识，以及提供方返回的联系邮箱和验证状态（如果提供）。Apple 的隐藏邮箱可能是转发地址。用于管理 Apple 授权生命周期的刷新令牌仅在服务端加密保存；Google 登录不申请离线刷新令牌。</li>
          <li><strong>学习数据：</strong>课程进度、句子掌握状态、重复次数、听写、笔记、生词、学习偏好、每日活动和答案反馈。</li>
          <li><strong>会话与安全数据：</strong>登录会话的令牌摘要、客户端类型、创建和到期时间，用于保持登录状态、撤销会话和防止滥用。</li>
          <li><strong>运行日志：</strong>服务会记录请求编号、请求方法和路径、响应状态、耗时、来源地址和数据量，用于安全监控、故障排查和服务运维。</li>
        </ul>

        <h2>我们如何使用数据</h2>
        <p>账号和第三方登录标识用于验证身份、将已绑定的登录方式对应到同一个学习账号，并显示你选择提供的资料。提供方返回的邮箱不会未经验证就自动绑定到已有账号。学习数据用于跨设备保存和恢复学习进度；会话与运行日志用于身份验证、限流、安全防护和排查故障。我们不会出售个人信息，也不会使用广告网络进行定向广告。</p>

        <h2>第一方产品分析</h2>
        <p>我们使用随机浏览器或安装标识记录页面与课程访问、清洗后的来源渠道、国家级网络出口地区、有效播放区间、练习行为类型和媒体质量。分析不复制听写、笔记正文、完整来源网址、原始 IP 或硬件标识。网络地区不代表国籍或常住地。产品分析默认在后台运行，不设置采集授权提示或采集开关。注册请求的网络地区及必要安全日志与第一方产品分析数据分开处理。</p>
        <p>原始分析事件保留90天，分析会话和用户日事实最长13个月。删除账号同时删除分析事件、会话、分析属性和用户日事实中的账号关联。运营汇总仅供受限管理员访问。</p>
        <h2>数据共享与第三方服务</h2>
        <p>数据会在提供服务所需的服务器、数据库、对象存储和日志运行环境中处理。邮箱验证码由事务邮件服务发送。只有在你主动选择相应登录方式时，Apple 或 Google 才会处理该次授权并向我们返回验证身份所需的信息；我们不申请 Gmail、通讯录或云端文件权限。维护者只授予完成运维、修复故障和保护服务所需的访问权限。当前官网没有接入广告 SDK 或第三方分析 SDK；如果以后增加会收集个人数据的服务，我们会先更新本政策，说明其用途和共享范围。</p>

        <h2>数据保留</h2>
        <ul className="legal-list">
          <li>账号信息和学习数据会在账号存续期间保留，以便提供登录和学习同步功能。</li>
          <li>已绑定的第三方登录标识和相关授权记录会保留到解除绑定或删除账号；解除 Apple 绑定或删除账号时，我们会请求撤销相应的 Apple 授权。</li>
          <li>登录会话会在到期、被撤销或账号删除时失效并清除。</li>
          <li>运行日志不会作为用户学习档案长期保留；它们只在安全和运维需要的期间保留，并按照部署环境的滚动或删除策略覆盖。</li>
          <li>法律要求必须保留的记录，只在法定期限内保留，并限制为履行该义务所需的范围。</li>
        </ul>

        <h2>删除账号与数据</h2>
        <p>已登录用户可以在 App 的“设置 → 账号与安全 → 删除账号”中，通过当前账号可用的邮箱验证码、密码或已绑定的第三方方式重新验证身份，然后确认删除；没有密码也可以完成。删除成功后，账号、登录会话、已绑定的第三方身份与授权记录、课程进度、句子进度、生词、笔记、活动记录、偏好和答案反馈等账号级数据会从服务端删除；如果账号同时关联内容协作身份，该关联会被解除，但不会删除由该身份参与维护的公共课程内容。</p>
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
