# Course releases and playback

## Content preparation boundary

Content preparers supply AAC-LC/M4A mono audio, or H.264/AAC/yuv420p MP4 video with one audio track and at most one video track. The application does not transcode a playback file or change channel count. FFprobe validates tracks/timeline origins; FFmpeg reads the selected audio track only to calculate a 10 ms waveform summary. The original bytes are copied unchanged to a SHA-256-addressed storage key which is never issued for direct uploads.

## Frozen content

`V202609230001__immutable_course_releases.sql` creates release snapshots, source analyses, expiring preview access and verification records. Tables have ordinary indexed relationship columns, without database foreign keys.

A release contains the exact media URL, metadata and all subtitle texts/translations/IDs. Its manifest binds `courseReleaseId`, byte-derived `mediaRevision`, `timelineId`, canonical `subtitleRevision`, `waveformRevision` and `playbackContractVersion`. Presentation time starts at source zero. Nonstandard origins or multiple candidate tracks require the content preparer to resolve them, rather than the application guessing a time mapping.

Old published records are copied by the migration as contract **0**, `verifiedMedia=false`, with a labelled legacy URL identity, not a fabricated byte checksum. New releases use contract **1** and analysed media. Existing historical assets must remain available; working-copy edits do not delete them. Storage retention/garbage collection is intentionally separate from editing.

Analysis cache entries include immutable object name plus source ETag. A changed upload is reanalysed; previous release data is retained. A release points at the analysed content-addressed copy, so even overwriting the original upload cannot change a published version. Waveform identity is calculated from the same analysed bytes and explicit analysis configuration.

The exercise's `published_release_id` is switched in the same transaction as approval. Editing metadata, media or subtitles changes the working copy; learners continue to receive the previous release. Explicit withdrawal clears the pointer. Old published IDs remain addressable while the course is still published, so a learner can finish the version already loaded.

Subtitle saves/submissions carry the media URL the editor actually loaded. A mismatch is a conflict, not an implicit rebind. Drafts also persist that binding; approval rejects a draft attached to a previous media source. New editor/imported lines use stable UUID-based IDs; moving, deleting and merging no longer renumbers unrelated lines.

## Learner preview and approval

The editor and review modal both offer **Learner preview**. It freezes the submitted media/lines, displays the canonical waveform and uses the same web adapter/shared controller as the learner app. Rate, repeat count and translation locale are explicit. Identical previews can be reopened without discarding their checks.

A deep link opens `mobile-app/app/preview/[token].tsx`. The link expires in 24 hours and requires a logged-in, currently authorized learner account bound to an active workflow member. Only a token hash is stored. API calls carry the token in a POST body, not an access-log URL. Preview responses are `no-store` and are not persisted in the mobile query cache.

The user must finish a sentence, check the alignment and explicitly confirm it. Evidence records requested and reported start/end positions, rate, adapter, contract version, actor and platform. The server rejects early completion or more than 50 ms of reported boundary error. This is a **human attestation plus reported-position check**, not cryptographic device attestation or proof of physical speaker/headphone latency.

Approval requires web, iOS and Android confirmations on the same preview content owned by the assigned reviewer. Changed media/subtitles require new matching checks. No checks are automatically fabricated by the application.

## Playback and caches

`@duolinting/playback` is the shared controller. Source coordinates are integer microseconds; subtitle editing still uses milliseconds. Bounds are `[start,end)`. Only `range-ended` advances a repeat. Pause, interruption, source replacement, timeout and failure settle pending promises but do not report completion. Repeats also cancel while waiting between iterations.

Browser clients use `/web`; no full-file WAV preview is generated. Native Expo players use the local `timed-playback` module. iOS uses native seek completion and `forwardPlaybackEndTime`. Android uses exact seek parameters, native readiness/position callbacks and a Media3 message scheduled on media time. This removes the JavaScript timer from the native stopping path, without promising zero hardware output latency.

The new native code needs a rebuilt application binary; Expo Go and a JavaScript-only update cannot provide it. A missing module produces an update-required message. Audio format errors are not silently worked around by another engine.

Learner cache keys include release identity. A course already being studied remains pinned; a newer version is offered through an explicit update action. Mobile stores complete release responses under versioned query keys, rather than combining fields from different versions. This does not introduce an offline media-download feature; any platform media cache still uses immutable per-version URLs.

Old clients which do not declare a playback contract are treated as contract 0. They can read legacy releases; a new contract-1 course responds with upgrade-required instead of silently accepting older playback rules.

## Precision backend evaluation

`packages/playback/src/experimental/mediabunny.ts` is an evaluation-only browser backend. It decodes a requested range of at most 30 seconds and schedules source samples with Web Audio; video frames can be inspected by timestamp. It supports 1x only and is not imported by production clients. No converted media file is created. Its dependency is development-only; default playback is not switched based on a single browser test.

## Validation and rollout

- `npm run check:playback`: controller/adapter regression tests, including buffering, cancellation, seek timeout, source change, repeating and interruption.
- `NODE_ENV=test node --import tsx scripts/check-waveform-timing.mjs`: generates an 8-minute mono fixture with known markers at beginning/middle/end; validates the canonical waveform within 30 ms. No course content is seeded into production tables.
- `scripts/check-course-releases.mjs`: refuses to run except against the explicitly named isolated test database `release_check`; requires test MySQL/MinIO environment variables. Tests frozen bytes, atomic pointer switching, stale media rejection, three-platform gating, preview permissions/expiry and preview reuse.
- Native module compiled for iOS simulator and Android; Admin/Web/Mobile types and bundles are checked independently.
- Real browsers exercise both the production web adapter and the isolated precision prototype. Physical iOS/Android/Chrome/Safari output timing still requires the actual devices and human release checks. Reported positions do not establish a P95 speaker-output figure.

Before deployment, apply the Flyway migration and use the backend image containing FFmpeg. Rebuild the mobile application for its native module. The migration and test containers used during development do not deploy or modify production. No production host details belong in this document.
