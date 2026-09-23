# Timed playback native adapter

Local Expo SDK 54 module, autolinked from `mobile-app/modules`.

- iOS accepts the existing Expo `SharedRef<AVPlayer>`, uses zero-tolerance seek completion and `AVPlayerItem.forwardPlaybackEndTime`.
- Android accepts the existing Expo audio/video player, sets `SeekParameters.EXACT`, confirms the position with native player callbacks and schedules a Media3 `PlayerMessage` on source time. The native main looper pauses at that boundary. There is no JavaScript wall-clock timer that declares completion.
- Native snapshots retain course source time; the module never rewrites a course or transcodes media.
- Native callbacks are request-id scoped. Clear/source replacement removes observers/messages and rejects pending requests. JS snapshot reads use a cached thread-safe value.
- JavaScript code detects a missing native module and asks for an App update. Expo Go or a JS-only update cannot supply this capability.

Compiled against the installed Expo 54 dependencies on iOS simulator and Android. Physical output latency is not established by successful compilation. The publication preview check remains a human attestation on each target platform; it is not remote device attestation or proof of 30 ms P95 timing.

After source changes run `pod install` for an existing iOS project and rebuild the application binary. Android supports both Expo's source-project and prebuilt Maven autolinking modes.
