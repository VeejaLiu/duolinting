import { AnalyticsClient, webAttribution, browserAnalyticsStorage, browserClientType } from "@duolinting/analytics/web";
import { resolveApiUrl } from "./apiClient";
export { webAttribution };
export const analytics = new AnalyticsClient({
  storage: browserAnalyticsStorage(),
  uuid: () => crypto.randomUUID(),
  url: (path) => resolveApiUrl(path),
  clientType: browserClientType(),
  surface: "learner",
  build: import.meta.env.VITE_APP_BUILD || (import.meta.env.PROD ? "unknown" : "development"),
});
