# Collaboration services

`../collaboration-service.ts` is the stable public entry point used by existing
routes and services. Keep its exports compatible. Internal modules import one
another directly rather than importing this facade, to prevent cycles.

| Module | Responsibility |
| --- | --- |
| `policy.ts` | Roles, claim limits, deadlines and shared claim checks |
| `members.ts` | Administrator accounts, learner binding and preview eligibility |
| `claims.ts` | Claiming, releasing, expiring and renewing task ownership |
| `task-pool.ts` | Claimable courses and administrator workload overview |
| `assignments.ts` | Course assignments and assignee changes |
| `permissions.ts` | Edit, access, submit and review authorization |
| `drafts.ts` | Draft parsing, retrieval, learner previews and draft saves |
| `review.ts` | Submission, return, approval and reverting published subtitles |
| `audit.ts` | Activity events, subtitle versions and contributor credits |
| `inbox.ts` | Personal tasks, pending reviews and notifications |

Transaction boundaries, authorization checks, query order and audit writes are
kept within their original operations. Do not split a transaction across
independent calls when extending these modules. `audit.ts` uses the draft parser;
keep draft reads and saves independent of the review/audit layer to avoid cycles.
