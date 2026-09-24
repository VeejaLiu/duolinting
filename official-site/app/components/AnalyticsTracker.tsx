"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnalyticsClient, webAttribution } from "../lib/analytics/web";
let client: AnalyticsClient | undefined;
export function AnalyticsTracker() {
  const path = usePathname();
  useEffect(() => {
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
    if (!client) return;
    void client
      .configure(true, "", "anonymous", webAttribution())
      .then(() => client?.page(path));
    const timer = setInterval(() => void client?.flush(), 15000);
    const flush = () => void client?.flush();
    document.addEventListener("visibilitychange", flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [path]);
  useEffect(() => {
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
  }, [path]);
  return null;
}
