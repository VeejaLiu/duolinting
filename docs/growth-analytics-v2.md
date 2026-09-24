# Growth analytics V2 implementation

Definition: `growth_v2_1`. New events store explicit UTC timestamps; operational days use Asia/Shanghai. Local streak dates retain their existing semantics. The implementation follows the supplied growth design and expert assessment, in P0 → P1 → P2 order.

## Delivered code

| Phase | Implementation |
| --- | --- |
| P0 | Existing growth API remains available; internal/test accounts excluded explicitly; existing-account and authenticated-access labels clarified. New date filters, strict D1/D7/D30 access cohorts, weekly access-day distribution and explicit coverage records. Historical buckets retain their verified source timezone. |
| P1 | Server-issued analytics sessions/identity epochs; separate bearer verification without legacy access writes; anonymous/install IDs; default background collection; same-parent first-party signed cookie; sanitized 30-day attribution; server-side registration event after successful account insert in the same transaction. |
| P1 | Shared bounded persistent SDK, 50-event/64-KiB batches, original event IDs on retry, operation/sequence uniqueness, exponential backoff, account isolation, seven-day offline limit, idle session rotation. Web, Mobile Web, Native and independent official website integrations. |
| P1 | Published course-content version validation; actual foreground media progression; wall-clock interval union across devices and statistics-day boundaries; three-minute activation; qualified learning days; unique practiced course/version/sentence facts, mastery and answer-check events. |
| P1 | Unified trusted-proxy request IP, local MMDB country reader with bounded cache/reload, trusted-ingress country only behind configured peers; historical offline events use unknown geography. Raw IP, full UA, dictation and notes are absent from analytics storage. |
| P2 | Four Admin tabs; activation funnel, learning/visit retention, W1 window, new/retained/returning/lapsed weekly users, sustained weekly learners, mean/median duration, practice coverage, registration/visit/last-known/learning geography. |
| P2 | Playback attempts/start/finish/buffering, success/failure/cancellation and latency percentiles; course/build/client/media/country filters; admin upload outcomes and logical sizes. Authenticated contributor upload telemetry is separate from super-admin-only reports. |
| P2 | Provider-neutral traffic snapshot adapter/import API; Nginx actual-sent-byte JSON format; provider field mapping with explicit country semantics; downstream/origin split, sampling/completeness, idempotent partition replacement. Missing sources return `not_connected` and null bytes. |
| P2 | Synchronous transactional daily materialization; bounded 30-second report cache; protected aggregate CSV exports, formula escaping and small-sample suppression; user deletion serialization/cleanup; hourly optional retention sweep with DB advisory lock. |

The independent website and CommonJS backend use generated mirrors of the portable SDK/contracts. Run `node scripts/sync-analytics-contracts.mjs` after editing `packages/analytics/src`; `--check` detects drift. The domain package exports these contracts and the API client exposes context/event submission.

## Database and local validation

New migrations:

- `V202609240002__growth_analytics_v2.sql`: seven analytics tables, explicit coverage, identity and operation indexes.
- `V202609240003__activity_operation_idempotency.sql`: retry IDs for existing local-day mastery counters. Intentional repeat toggles remain legacy action counts, not knowledge mastery.

Both migrations were applied locally through the repository's backend-database Flyway path. The local server reports `SYSTEM` / UTC+7. This is **not** evidence of the production timezone, historical timestamp encoding, deployment coverage or completeness. No automatic complete-coverage rows are seeded. For legacy cohorts, configure the verified source timezone (UTC, Asia/Bangkok or Asia/Shanghai); missing/conflicting source timezone produces incomplete results.

Checks:

```sh
npm run check:analytics
npm run check:analytics:database
npm run check:admin-i18n
```

The database check requires a local `backend/.env`, creates a randomly named temporary schema, clones schema only, inserts isolated fixtures, and drops it in `finally`. It does not insert test users or courses into the application database. It checks repeated delivery, operation deduplication, real interval union across two sessions, activation, unique practice, no authentication-side access writes, all six reports, legacy growth, traffic snapshot replacement, withdrawal and account deletion.

Additional pure tests exercise 2× playback, seeks, suspension, background/buffering exclusion, Shanghai midnight, event validation, private-field exclusion, persistent queue/account isolation, forged proxy country, CDN HIT bytes and provider-region versus visitor-country semantics.

Build checks cover backend, Web, Admin, the independent official site and Expo Web export. A successful Expo Web export is not physical-device iOS/Android acceptance.

## Deployment configuration (no production values here)

Deployment is a separate owner-authorized operation; follow the ignored local runbook. None was performed during implementation.

- `TRUSTED_PROXY_CIDRS`: explicit controlled immediate and intermediate proxy networks. Empty means trust no forwarding headers. Never use a hop count or `true`.
- `ANALYTICS_TRUST_GEO_HEADER`: default false. Enable only after verifying ingress header overwrite and backend network isolation.
- Optional ingress files: `/etc/nginx/analytics/real-ip/*.conf` contains vetted `set_real_ip_from` / `real_ip_header` configuration; `/etc/nginx/analytics/cdn-peers/*.conf` contains matching trusted peer CIDRs with value `1`. Unconfigured country context remains unknown. Maintain current provider ranges in private operational configuration.
- `ANALYTICS_GEO_DB_PATH`: optional local country MMDB. The container mounts ignored `temp/geoip` read-only at `/var/lib/duolinting-geoip`. Provision and update a licensed database outside Git. Missing/corrupt databases yield unknown, never a guessed region.
- `ANALYTICS_COOKIE_DOMAIN`: explicitly validated shared first-party parent domain; no auth-token cookie scope is changed. Empty uses a host-only cookie. Browser Origin must be in the existing `CORS_ORIGINS`; native requests use bearer/context validation and rate limits.
- `ANALYTICS_MAINTENANCE_ENABLED=true`: hourly pruning; events 90 days, sessions and user/dimension daily facts 13 months. Legacy retry IDs retain 90 days. Consent/profile data remain account-owned until deletion.
- `RELEASE_REVISION`: passed by the existing server-build helper from the exact release commit, then into `VITE_APP_BUILD` / `EXPO_PUBLIC_APP_BUILD`. Local builds default to a development/unknown label.

After verifying deployment coverage and outages, use **Growth analytics V2 → Collection coverage & versions** to enter per-metric, per-client spans. Open-ended complete spans assert continued collection; record outages/partial spans when that assertion stops being true. The first event is not proof of coverage. Reports label incompleteness and restrict learning-retention interpretation to consenting, observable users.

## Traffic source onboarding

No provider account was read, configured or billed. Cloudflare/Tencent export permissions, plans, actual topology and log availability must be verified before connecting a live source. The product/quality implementation works with traffic disconnected.

Nginx media logs contain actual sent bytes, sanitized URI, status and cache state. If Nginx sits behind a CDN, these bytes describe **origin** traffic, not cached CDN downstream delivery. Edge cache HIT delivery requires an edge-provider source. Never calculate media traffic from file size × plays or API Content-Length.

For a verified whole-source partition:

```sh
node --import tsx scripts/import-analytics-traffic.mjs source.jsonl provider stable-partition-id origin
```

Supply admin base URL and bearer token only through private environment variables `ANALYTICS_ADMIN_BASE_URL` and `ANALYTICS_ADMIN_TOKEN`. `ANALYTICS_TRAFFIC_COMPLETE=true` is allowed only for a confirmed complete export. Default is partial. Re-fetch the provider's last 48 hours, reuse stable partition IDs, and replace the whole partition; do not feed append-only fragments with an identical ID. A partition may contain at most 500 dimensions. Provider-native exports can use `providerDelivery` with an explicit field map; service-region fields never become visitor-country fields implicitly. Actual fees still come from provider invoices.

## Remaining operational acceptance

- Verify production timezone/timestamp encoding, proxy hops and network access restrictions; configure trusted sources and coverage.
- Physically test native backgrounding, audio/video buffering, account switching and offline delivery. SDK 54 documentation was read before native changes.
- Connect authorized provider logs if real media traffic is required; absent data correctly remains unavailable.
- Measure database growth, report latency and device behavior under actual load; raw event queries are intended for the current small deployment, not warehouse-scale traffic.
- Wait for real cohort observation periods; D7/D30 maturity cannot be created by implementation or backfilled from progress snapshots.

These are deployment/source/device acceptance requirements, not claims of verified production results.

## Collection interface update

The Web, Mobile and official-site analytics trackers render no UI. Collection starts in the background without an authorization banner. All three trackers initialize collection unconditionally and no longer read `duolinting.analytics.consent`, including old denied values. There is no user-facing collection setting. The public privacy pages describe default background collection.
