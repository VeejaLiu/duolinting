import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { analytics, webAttribution } from "../lib/analytics";
import { useLanguage } from "../i18n/LanguageProvider";
export function AnalyticsConsent({
  token,
  owner,
  ready,
}: {
  token: string;
  owner: string;
  ready: boolean;
}) {
  const { t } = useLanguage();
  const path = useLocation().pathname;
  const [choice, setChoice] = useState(() =>
    localStorage.getItem("duolinting.analytics.consent"),
  );
  useEffect(() => {
    if (ready)
      void analytics
        .configure(choice === "granted", token, owner, webAttribution())
        .then(() => analytics.page(path));
  }, [choice, token, owner, ready, path]);
  useEffect(() => {
    const timer = setInterval(() => void analytics.flush(), 15000);
    const flush = () => void analytics.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  const choose = (value: string) => {
    localStorage.setItem("duolinting.analytics.consent", value);
    setChoice(value);
  };
  return (
    <aside
      aria-label={t("analytics.title")}
      style={{ padding: "8px 16px", fontSize: 12 }}
    >
      <span>
        {t(choice === null ? "analytics.description" : "analytics.title")}
      </span>{" "}
      <button
        type="button"
        onClick={() => choose(choice === "granted" ? "denied" : "granted")}
      >
        {t(choice === "granted" ? "analytics.disable" : "analytics.allow")}
      </button>
      {choice === null && (
        <button type="button" onClick={() => choose("denied")}>
          {t("analytics.decline")}
        </button>
      )}
    </aside>
  );
}
