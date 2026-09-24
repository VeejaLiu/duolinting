import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { analytics, webAttribution } from "../lib/analytics";
export function AnalyticsTracker({
  token,
  owner,
  ready,
}: {
  token: string;
  owner: string;
  ready: boolean;
}) {
  const path = useLocation().pathname;
  useEffect(() => {
    if (ready)
      void analytics
        .configure(true, token, owner, webAttribution())
        .then(() => analytics.page(path));
  }, [token, owner, ready, path]);
  useEffect(() => {
    const timer = setInterval(() => void analytics.flush(), 15000);
    const flush = () => void analytics.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  return null;
}
