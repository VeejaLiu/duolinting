import { useEffect } from "react";
import { usePathname } from "expo-router";
import { Platform } from "react-native";
import { webAttribution } from "@duolinting/analytics/web";
import { analytics } from "@/lib/analytics";
import { useAuthStore } from "@/stores/authStore";
export function AnalyticsTracker() {
  const path = usePathname();
  const { authToken, authUser, authReady } = useAuthStore();
  useEffect(() => {
    if (authReady)
      void analytics
        .configure(
          true,
          authToken,
          authUser ? String(authUser.id) : "anonymous",
          Platform.OS === "web" ? webAttribution() : undefined,
        )
        .then(() => analytics.page(path));
  }, [authToken, authUser, authReady, path]);
  useEffect(() => {
    const timer = setInterval(() => void analytics.flush(), 15000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
