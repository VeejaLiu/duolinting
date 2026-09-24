import { AnalyticsClient, webAttribution } from "@duolinting/analytics/web";
import { resolveApiUrl } from "./apiClient";
export { webAttribution };
export const analytics = new AnalyticsClient({
  storage: localStorage,
  uuid: () => crypto.randomUUID(),
  url: (path) => resolveApiUrl(path),
  clientType: "web_app",
  surface: "learner",
  build: import.meta.env.VITE_APP_BUILD ?? "development",
});
