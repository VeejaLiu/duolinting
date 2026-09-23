# Shared playback contract — first implementation

`@duolinting/playback` owns session identity, cancellation and range completion. It has no React, Expo, HTML media or audio decoder dependency. The `/web` entry adapts an existing HTML media element; the mobile app supplies an Expo adapter. No transcoding or channel conversion is performed.

## Time and results

- Source coordinates are integer microseconds. Existing transcript seconds are converted once at each adapter boundary; UI editing remains in milliseconds. This does not promise microsecond output accuracy.
- A range is `[startUs, endUs)`, without hidden padding or an early-stop epsilon. Playback speed never changes those source coordinates.
- `controller.play(plan)` immediately returns a session with `started`, `finished` and `cancel()`.
- `started` reports `started`, `cancelled`, `failed` or `timeout`.
- `finished` distinguishes `range-ended`, `media-ended`, `cancelled`, `paused`, `interrupted`, `failed` and `timeout`.
- Only `range-ended` should advance a sentence loop. Pause, failure, EOF before the requested end, and cancellation are not completion.
- Replacing a session cancels and settles both promises of the old session. Source identity is rechecked before playback and during events. A seek/start watchdog can fail an operation; it never completes an audio range based on wall time.
- Bounds outside known media duration fail instead of silently shortening the requested sentence. Normal completion pauses at the observed end; it does not seek over unheard content.

Admin preserves its existing “await start” wrapper; the web learning workflow awaits `finished`. Both use the same controller and browser adapter. Mobile's legacy `onEnded` callback fires only for `range-ended`.

## Platform limits

HTML uses `seeked` plus reported-position verification. Native Expo audio awaits `seekTo`; native video SDK 54 is extended by the local timed-playback module to expose seek completion and native boundaries. Neither is proof of sample/frame output accuracy. The Expo adapter serializes pending native seeks and polls actual source position while a session is active. Its 20 ms observation interval is not a native clipping guarantee.

Browser sessions are interrupted when the document becomes hidden. Mobile sessions are interrupted when AppState is no longer active. Pitch preservation is configured explicitly for the learning clients.

## Validation

`npm run check:playback` runs deterministic controller regression cases (buffering, exact boundary, cancellation, timeout, stale requests, source replacement and source coordinates at different rates). Build the workspace before building clients; root scripts and application Dockerfiles do this.

Real Chromium smoke checks use the prepared AAC/M4A fixture from the original investigation. Device/output timing still needs Chrome/Safari/iOS/Android acoustic and visual measurements. No P95 output precision claim is made by unit tests.

## Release integration

The immutable release, preview access, canonical waveform, cache pinning and publication checks are described in [course-release-playback.md](../../docs/course-release-playback.md).

Native clients use the local timed-playback module for seek completion and source-time stopping. The generic controller still supports minimal adapters in tests. `repeat(plan, count, gapMs)` advances only after `range-ended` and cancels pending gap timers.

An evaluation-only Mediabunny backend is under `src/experimental`; production entry points do not export or import it. Physical output timing remains a device-test concern, not a promise inferred from microsecond coordinates.
