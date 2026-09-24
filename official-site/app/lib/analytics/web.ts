import { AnalyticsClient } from "./client";
export { AnalyticsClient };
export function webAttribution() {
  const params = new URLSearchParams(location.search);
  let referrer_host = "";
  try {
    referrer_host = new URL(document.referrer).hostname;
  } catch {
    /* Direct visit. */
  }
  return {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    landing_path: location.pathname,
    referrer_host,
  };
}
export function observeMedia(client: AnalyticsClient, media: HTMLMediaElement) {
  let buffering = false;
  const sample = () =>
    client.sample(
      media.currentTime * 1000,
      document.visibilityState === "visible" &&
        !media.paused &&
        !media.seeking &&
        !media.ended,
      buffering &&
        !media.paused &&
        !media.seeking &&
        document.visibilityState === "visible",
      media.playbackRate,
    );
  const wait = () => {
    sample();
    buffering = true;
  };
  const ready = () => {
    buffering = false;
  };
  const visibility = () => {
    sample();
    void client.flush();
  };
  media.addEventListener("waiting", wait);
  media.addEventListener("playing", ready);
  media.addEventListener("seeking", ready);
  media.addEventListener("pause", sample);
  document.addEventListener("visibilitychange", visibility);
  const timer = setInterval(sample, 250);
  const flush = setInterval(() => void client.flush(), 15000);
  return () => {
    sample();
    clearInterval(timer);
    clearInterval(flush);
    media.removeEventListener("waiting", wait);
    media.removeEventListener("playing", ready);
    media.removeEventListener("seeking", ready);
    media.removeEventListener("pause", sample);
    document.removeEventListener("visibilitychange", visibility);
    client.endStudy();
  };
}
