# Course editing and playback

## One current course

Each course has one current media file, metadata record and formal transcript in `exercises`. There are no published release snapshots, release selection, version-pinned learner caches, or media-binding conflicts. Replacing media updates the same course and preserves personal subtitle drafts and assignments. Contributors should check sentence timing if replacement media has a different timeline.

The migration `V202609240001__restore_single_course_publication.sql` preserves the visibility of courses previously served through a release pointer, then clears those pointers. Historical release tables remain unused; old migrations and existing data are not deleted.

## Personal work and review

Claiming a course continues to use the existing personal subtitle draft and review workflow. Saving a contributor's draft does not overwrite the formal transcript. Approval replaces the formal transcript on the same course. Existing subtitle edit history and audit records remain available through the original history feature.

Authorized proofreaders and reviewers can see their assigned courses in the normal learner app. Proofreaders see their own work; reviewers see submissions assigned to them. Ordinary learners see published courses and formal subtitles. There is no separate learner-preview window, QR link, or device-confirmation requirement.

## Playback

The shared playback controller and native timing improvements remain. Sentence times use the original media timeline. A source change cancels active playback; it does not create a course version. The application does not transcode media or change its channel count. M4A with AAC-LC mono audio remains the recommended content-preparation format, but preview/publication no longer adds a format-analysis gate.

The native playback module requires a rebuilt mobile binary. Precision on physical devices remains subject to manual regression. Waveform timing and playback-controller checks are available separately; publishing does not require these checks.

## Admin waveform cache

Waveform rendering starts as soon as cached peaks are available, independently of the preview player's `canplay`, buffering or download state. The hidden WaveSurfer media element has no source URL when peaks are supplied, so it makes no extra media request. The main preview requests metadata only; playback fetches the needed ranges separately. Main-player metadata later updates the editor duration and cursor without decoding again or changing the peaks' source timeline.

A selected local file starts decoding in parallel with its upload. Its immutable File/Blob object shares the same result across editor remounts without rereading or hashing the bytes. As soon as the server binds the uploaded object to a course, the first waveform is silently persisted, even if navigation/catalog refresh disposes the editor. A save retry also fills the cache after binding succeeds. Invalid caches/unsupported decoding still fall back to the original loader.

Server cache is authoritative for shared reuse. Course details return the waveform in `media_analyses` for the current managed object and its current storage ETag, plus an opaque `waveformSourceRevision` (SHA-256 of object name and ETag). A new URL/object or changed bytes at the same object automatically misses the previous cache. Old rows are not served as current media. No media decoding runs in the backend request process.

On a miss, Admin generates 10 ms peak buckets at 8 kHz from the first channel. Once the waveform is rendered, a background job submits the summary to `/api/v1/admin/exercises/:exerciseId/waveform-cache`. It uses the existing admin/password-change and course-access checks. The server locks the course record, checks the submitted source against its current object and ETag, validates bucket count/duration/finite amplitudes, and upserts the unique object/ETag row. A stale completion receives 409 and cannot become the new media's cache. A malformed existing row can be repaired by the same fill. This maintenance changes no media, subtitles, publication state or learner progress.

Locally selected media is decoded immediately, then silently submitted after the importer's existing upload and course binding have completed. Server failures are retried up to three times in the background; auth/conflict/validation failures stop retries. There is no button, toast, dialog, extra save step or canvas reinitialization for server synchronization. A later open retries if persistence never succeeded. The next browser/editor opening the same media receives the stored peaks directly from course details.

IndexedDB and memory remain fallback layers. They contain peak summaries keyed by SHA-256 of media bytes and a versioned analysis format, never media bytes or signed URLs. Strong remote ETags allow reuse without another analysis download; backend HEAD checks access and reads only metadata. Expiring backend signatures are excluded from the validator key. Without an exposed strong ETag, current bytes are downloaded and hashed. A HEAD/GET race saves only under the GET's actual validator. In-flight browser work is shared within a page and serialized across same-origin tabs using Web Locks where supported. Different browsers may both decode if they open before the first server fill finishes; fills are idempotent.

Old loads never attach to a newly selected source. Invalid cache records are regenerated. Database cache reads fail open; IndexedDB waits are bounded to 1.5 seconds, with memory-only reuse when storage is unavailable. Preparation failures fall back to the original WaveSurfer loader; its successful decode can still supply a server fill. Memory summaries are bounded to approximately 16 MiB (allowing one oversized entry), persistent browser summaries to approximately 64 MiB, and individual summaries to two million buckets. Wire amplitudes use four decimals and the dedicated endpoint accepts at most 20 MiB. Browser-cache eviction does not remove the shared server cache. Unmanaged legacy external media continues to use browser caching because it has no authoritative storage object/ETag.

Regression check: `node scripts/check-server-waveform-cache.mjs` validates source binding, shared fills, stale completions, corrupt-row repair and silent client retry behavior with isolated storage/network doubles. It never opens a database or changes course records.
