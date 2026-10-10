import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Application from "expo-application";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { AnalyticsClient } from "@duolinting/analytics/client";
import { browserClientType } from "@duolinting/analytics/web";
import { apiClient } from "./apiClient";
// Store binaries supply the actual version/build even when no release hash
// was injected. A production native build must never call itself development.
const nativeBuild = Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ? `expo-go:${Constants.expoConfig?.version ?? "unknown"}`
  : `${Platform.OS}:${Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "unknown"}+${Application.nativeBuildVersion ?? "unknown"}`;
export const analytics = new AnalyticsClient({
  storage: AsyncStorage,
  uuid: () => Crypto.randomUUID(),
  url: (path) => apiClient.resolveApiUrl(path),
  clientType: Platform.OS === "web" ? browserClientType() : "mobile_app",
  surface: "learner",
  build: (process.env.EXPO_PUBLIC_APP_BUILD || (Platform.OS === "web" ? "unknown" : nativeBuild)).slice(0, 64),
});

// The former settings switch stored an account/device choice. Analytics now
// follows the product's default collection policy, so retire that stale value.
export const clearLegacyAnalyticsChoice = (owner: string) =>
  AsyncStorage.removeItem(`duolinting.mobile.user.${encodeURIComponent(owner)}.analytics-choice.v1`);
