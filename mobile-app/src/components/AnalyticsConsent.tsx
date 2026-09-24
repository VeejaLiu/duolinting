import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { analytics } from "@/lib/analytics";
import { useAuthStore } from "@/stores/authStore";
import { useLanguage } from "@/i18n/LanguageProvider";
export function AnalyticsConsent() {
  const { t } = useLanguage();
  const path = usePathname();
  const { authToken, authUser, authReady } = useAuthStore();
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void AsyncStorage.getItem("duolinting.analytics.consent")
      .then(setChoice)
      .catch(() => setChoice(null));
  }, []);
  useEffect(() => {
    if (authReady && choice !== undefined)
      void analytics
        .configure(
          choice === "granted",
          authToken,
          authUser ? String(authUser.id) : "anonymous",
        )
        .then(() => analytics.page(path));
  }, [choice, authToken, authUser, authReady, path]);
  useEffect(() => {
    const timer = setInterval(() => void analytics.flush(), 15000);
    return () => clearInterval(timer);
  }, []);
  const choose = (value: string) => {
    setChoice(value);
    void AsyncStorage.setItem("duolinting.analytics.consent", value);
  };
  if (choice === undefined) return null;
  return (
    <View style={{ padding: 8, backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 12 }}>
        {t(choice === null ? "analytics.description" : "analytics.title")}
      </Text>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => choose(choice === "granted" ? "denied" : "granted")}
        >
          <Text style={{ color: "#087bb1" }}>
            {t(choice === "granted" ? "analytics.disable" : "analytics.allow")}
          </Text>
        </Pressable>
        {choice === null && (
          <Pressable
            accessibilityRole="button"
            onPress={() => choose("denied")}
          >
            <Text>{t("analytics.decline")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
