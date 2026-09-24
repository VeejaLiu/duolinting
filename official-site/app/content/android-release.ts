/**
 * Android APK release manifest for the official download page.
 *
 * Keep this file synchronized with the final signed APK uploaded to the official
 * HTTPS release storage. `downloadUrl`, `fileSize`, and `sha256` must be taken
 * from that exact uploaded file—not copied from a previous build.
 */
export const androidRelease = {
  status: "published" as "preparing" | "published",
  version: "1.0",
  build: "9",
  packageName: "com.duolinting.app",
  releasedAt: "2026-09-24" as string | null,
  fileSize: "84.58 MB" as string | null,
  sha256: "8d95348fdc671b272e15bdbd9fea91310867e9bcde4e915ae5eeca989fbf1b0d" as string | null,
  downloadUrl: "/api/v1/media/android-apk" as string | null,
  certificateSha256: "443b4401be99065ed1ad62c98ab1bf15f9d80494d90dace48f42488f5460fd2d" as string | null,
  notes: {
    zh: ["首个官网 Android 正式版本。", "支持登录后同步学习进度、浏览课程并进行逐句精听。"],
    en: ["First official Android release from the DuolinTing website.", "Sign in to sync progress, browse courses, and practice line by line."],
  },
};
