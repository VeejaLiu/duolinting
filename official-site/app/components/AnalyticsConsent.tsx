"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnalyticsClient, webAttribution } from "../lib/analytics/web";
let client: AnalyticsClient | undefined;
export function AnalyticsConsent() {
  const path = usePathname();
  const en = path.startsWith("/en");
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setChoice(localStorage.getItem("duolinting.analytics.consent"));
    client ??= new AnalyticsClient({
      storage: localStorage,
      uuid: () => crypto.randomUUID(),
      url: (p) => p,
      clientType: "web_app",
      surface: "official",
      build: import.meta.env.VITE_APP_BUILD ?? "development",
    });
  }, []);
  useEffect(() => {
    if (choice === undefined || !client) return;
    void client
      .configure(choice === "granted", "", "anonymous", webAttribution())
      .then(() => client?.page(path));
    const timer = setInterval(() => void client?.flush(), 15000);
    const flush = () => void client?.flush();
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [choice, path]);
  useEffect(() => {
    if (choice !== "granted") return;
    const attribution = webAttribution();
    // Propagate only allow-listed campaign values to the configured learner destination; no authentication data.
    const learner = import.meta.env.VITE_LEARNER_APP_URL;
    if (!learner) return;
    let origin: string;
    try {
      origin = new URL(learner).origin;
    } catch {
      return;
    }
    const click = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a");
      if (!link) return;
      const url = new URL(link.href);
      if (url.origin !== origin) return;
      for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
        const value = attribution[key];
        if (value && /^[\p{L}\p{N}_. -]{1,100}$/u.test(value))
          url.searchParams.set(key, value);
      }
      link.href = url.toString();
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [choice, path]);
  if (choice === undefined) return null;
  const choose = (v: string) => {
    localStorage.setItem("duolinting.analytics.consent", v);
    setChoice(v);
  };
  return (
    <aside
      style={{ padding: 12, fontSize: 13, background: "#f5f9fc" }}
      aria-label={en ? "Optional analytics" : "可选分析"}
    >
      {choice === null
        ? en
          ? "Allow first-party visits, network region and playback analytics? Declining does not affect learning."
          : "允许第一方访问、网络地区和播放体验分析？拒绝不影响学习。"
        : en
          ? "Optional analytics"
          : "可选分析"}{" "}
      <button
        type="button"
        onClick={() => choose(choice === "granted" ? "denied" : "granted")}
      >
        {choice === "granted"
          ? en
            ? "Disable"
            : "关闭"
          : en
            ? "Allow"
            : "允许"}
      </button>{" "}
      {choice === null && (
        <button type="button" onClick={() => choose("denied")}>
          {en ? "Decline" : "拒绝"}
        </button>
      )}
    </aside>
  );
}
