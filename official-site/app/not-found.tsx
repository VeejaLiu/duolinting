import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><div><p className="eyebrow"><span></span>404</p><h1>这个页面还没有准备好。</h1><p>回到 DuolinTing 首页，或查看 Android 下载说明。</p><div><Link className="button button-primary" href="/">返回首页</Link><Link className="button button-secondary" href="/download">查看下载</Link></div></div></main>;
}
