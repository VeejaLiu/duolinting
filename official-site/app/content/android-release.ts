/**
 * Android APK release manifest for the official download page.
 *
 * Keep this file synchronized with the final signed APK uploaded to the official
 * HTTPS release storage. `downloadUrl`, `fileSize`, and `sha256` must be taken
 * from that exact uploaded file—not copied from a previous build.
 */
export const androidRelease = {
  status: "preparing" as "preparing" | "published",
  version: "0.1.0",
  build: "5",
  packageName: "com.duolinting.app",
  releasedAt: null as string | null,
  fileSize: null as string | null,
  sha256: null as string | null,
  downloadUrl: null as string | null,
  certificateSha256: null as string | null,
  notes: {
    zh: ["首个官网 APK 发布时填写经过真机核验的更新说明。"],
    en: ["Add release notes verified on a physical device when the first official APK is published."],
  },
};
