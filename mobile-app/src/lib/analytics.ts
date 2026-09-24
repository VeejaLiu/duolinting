import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { AnalyticsClient } from "@duolinting/analytics/client";
import { apiClient } from "./apiClient";
export const analytics = new AnalyticsClient({
  storage: AsyncStorage,
  uuid: () => Crypto.randomUUID(),
  url: (path) => apiClient.resolveApiUrl(path),
  clientType: Platform.OS === "web" ? "mobile_web" : "mobile_app",
  surface: "learner",
  build: process.env.EXPO_PUBLIC_APP_BUILD ?? "development",
});
