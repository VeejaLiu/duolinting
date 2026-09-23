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
