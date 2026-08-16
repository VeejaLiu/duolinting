# DuolinTing Agent Guide

This file is the entry point for AI coding agents. It assumes you know nothing
about the project.

## Project Overview

DuolinTing is a front-end/back-end separated intensive-listening product.
It is an npm-workspaces monorepo named `duolinting`, with four product
applications, one independent official-site application, and five shared packages:

- `backend` (`@duolinting/backend`): unified Node.js backend for catalog,
  exercises, auth, learner progress, feedback, admin content operations, and
  media upload intents. Express 5 + Sequelize (mysql2) + MinIO client, written
  in TypeScript, compiled to CommonJS with `tsc`, run in dev with `tsx watch`.
- `web-app` (`@duolinting/web-app`): learner-facing listening app. React 19 +
  Vite + Radix UI + react-router-dom, port 8101 in dev.
- `admin` (`@duolinting/admin`): administrator content-management app. Same
  stack as web-app plus wavesurfer.js, port 8102 in dev. Ant Design is the
  workspace UI framework (with Radix Select/Dialog inside the course-production
  workbench). Keep it professional and operational, not playful.
- `mobile-app` (`@duolinting/mobile-app`): Expo (~54) app using expo-router,
  nativewind (Tailwind), @tanstack/react-query, and zustand. Routes live in
  `mobile-app/app/`; feature code in `mobile-app/src/`. Its own `AGENTS.md`
  says: read the versioned Expo docs at https://docs.expo.dev/versions/v54.0.0/
  before writing any code — Expo APIs have changed.
- `official-site` (`duolinting-official-site`): independent vinext product
  website, kept in this repository but outside npm workspaces. It runs on Node
  22 and does not depend on backend, database, or shared packages.
- `packages/domain`: shared domain contracts (auth, catalog, exercises,
  progress types) used by all clients.
- `packages/shared`: shared domain contracts and system-level constants for
  backend/admin.
- `packages/api-client`: typed fetch-based API client (`ApiClientError`,
  request helpers) built on `@duolinting/domain` + `@duolinting/app-config`.
- `packages/app-config`: runtime config — API base URL resolution
  (`VITE_API_BASE_URL` / `EXPO_PUBLIC_API_BASE_URL`), auth token storage keys,
  feature flags.
- `packages/ui-tokens`: shared design tokens.

Infrastructure (local, `docker-compose.yml`): MySQL 8.4 (host port 3307),
MinIO (API 9000, console 9001), and a one-shot Flyway service (profile `tools`)
that runs the migrations in `infra/mysql/migrations`.

Local dev services:

- Learner app: `http://127.0.0.1:8101`
- Admin app: `http://127.0.0.1:8102`
- Backend health: `http://127.0.0.1:8100/api/health`
- Backend inspector (dev:debug): `127.0.0.1:9229`
- MinIO console: `http://127.0.0.1:9001` (default local creds `minioadmin` / `minioadmin`, bucket `duolinting-media`)
- Default local database: `duolinting_app_dev`

## Agent Working Rules (from the project owner)

- When using the owner's signed-in browser for a multi-step workflow, keep pages open whenever the workflow is awaiting owner confirmation or may need to continue. Preserve the current page and entered state; close a tab only after the workflow is complete, the owner explicitly asks to close it, or the page is demonstrably unusable.
- To save time, do not ask the owner to confirm source snippets, run routine Git
  status checks, take screenshots after deployment, or open a browser to inspect
  deployed pages. The owner verifies pages and functionality manually. Perform
  these checks only when the current conversation explicitly requests them.
  Before a commit, release, or open-source publication, one read-only review is
  allowed to confirm the change scope and detect accidentally included secrets,
  production addresses, private configuration, or large files. Do not use that
  review as an opportunity to modify or clean up unrelated changes.
- Add clear comments around critical logic such as calculations, conversions,
  validation, and custom data formats. Explain each field's format and meaning,
  as well as why the implementation handles it that way.
- On learner clients (`web-app` and `mobile-app`), prefer Radix UI or React Native
  components appropriate to the platform and follow the existing design system.
  Ant Design is the primary UI framework for Admin; the existing Radix
  Select/Dialog components in the course-production workbench may remain. Reuse
  existing dependencies and interaction patterns before introducing new ones.
- Use `#1cb0f6` (Duolingo blue) for hover-border changes across buttons, tags,
  cards, and other interactive elements. A normal, unselected element must use
  this color when its border changes on hover. Active or success states may use
  a darker shade of their own semantic color where appropriate.

## Build and Run Commands

Root scripts (npm workspaces; packages build in dependency order
domain → app-config → ui-tokens → api-client → shared):

```bash
npm install                 # install all workspaces
npm run infra:up            # start MySQL + MinIO via docker compose
npm run db:migrate          # run Flyway migrations (docker compose tools profile)
npm run dev                 # build packages, then run backend + web-app + admin
npm run dev:debug           # same, with backend inspector on 9229
npm run dev:backend         # backend only (tsx watch)
npm run dev:web-app         # web-app only (vite, 127.0.0.1:8101)
npm run dev:admin           # admin only (vite, 127.0.0.1:8102)
npm run dev:mobile-app      # build packages, then expo start
npm run build               # build packages + backend + web-app + admin
npm run lint                # eslint .
npm run typecheck           # tsc --noEmit / tsc -b across workspaces
```

First-time local setup (see `README.md`). Flyway migrations are the default and
authoritative setup path:

```bash
cp .env.example .env
npm run infra:up
npm run db:migrate
npm run dev
```

`infra/mysql/init.sql` is a legacy bootstrap snapshot for compatibility with
older local environments. Do not use it for new installations or schema
changes; use Flyway migrations instead.

## Testing and Quality

There is no test framework configured in this repo (no vitest/jest/mocha, no
test files). The available quality gates are `npm run typecheck`,
`npm run build`, and `npm run lint`. The owner verifies pages and functionality
manually.

Lint setup (`eslint.config.js`): flat config, typescript-eslint recommended,
react-hooks + react-refresh for `web-app`/`admin`, Node globals for
`backend`/`packages/shared` (with `no-explicit-any` and `no-require-imports`
turned off there). `mobile-app` and most `packages/*` are not covered by the
lint config.

## Code Organization

### Backend (`backend/src`)

- `app.ts`: server bootstrap, CORS (explicit origins, plus loopback/private-LAN
  origins allowed only in development for Expo), cookie parser, JSON body,
  error handler, shutdown handling.
- `router/index.ts` mounts everything under `/api`; `router/v1/index.ts` mounts
  versioned routers: `/catalog`, `/exercises`, `/user`, `/auth`, `/progress`,
  `/feedback`, `/admin`, `/media` (so full paths are `/api/v1/...`).
- `general/*`: business services, one folder per domain — `admin`
  (admin-auth, admin-service, user-activity-service), `catalog`, `feedback`,
  `media`, `progress`, `user` (user-service, user-session-service).
- `models/schema/*`: Sequelize models — `AdminUserDB`, `CategoryDB`,
  `CategoryGroupDB`, `ExerciseDB`, `ExerciseProgressDB`, `LineProgressDB`,
  `UserDB`, `UserSessionDB`, `VocabularyItemDB`. `models/db-config-mysql.ts`
  holds the Sequelize connection.
- `lib/*`: logger, requestLogger, token, env, express-validator helpers,
  banner. `loaders/*`: startup integrations (winston, status monitor).

Primary API groups: `/api/v1/catalog`, `/api/v1/exercises/:exerciseId`,
`/api/v1/auth/register|login|me`, `/api/v1/progress`, `/api/v1/feedback`,
`/api/v1/admin/*`, `/api/v1/media/upload-intents`.

Auth: learner auth uses email/password. JWTs identify a server-side row in
`user_sessions`; only a token hash is stored, sessions are separated by client
type, and they can expire or be revoked. Admin content-management writes require
an administrator login. The admin app holds the returned bearer token locally,
while the database stores only its hash and absolute expiration time; logout
invalidates the server-side session. bcryptjs is used for password hashing.

### Web app (`web-app/src`)

Organized around the learning session, not one large page:

- `App.tsx`: session orchestration, selected stage, active course, composition.
- `hooks/`: `useCatalog` (remote catalog + selected series), `useStudyProgress`
  (sentence progress, mastery, vocabulary, dictation), `useMediaPlayback`
  (media range playback), `useLearnerAccount` (login state + server progress
  persistence), plus `useCategoryExercises`, `useExerciseDetail`.
- `components/`: focused learner UI — `CourseMap`, `ExtensiveStage`,
  `IntensiveStage`, `DifficultReviewStage`, `TranscriptPanel`, `StageRail`,
  `StudyHero`, `AuthDialog`, `TopBar`, etc.
- `styles/`: style modules split by shell, catalog/map, study shell, stages,
  transcript panel, auth, responsive behavior.
- `i18n/`: semantic-key UI localization (zh-CN/en-US/th-TH/ja-JP). Per-module
  message tables live in `i18n/messages/*.ts` (key prefixed by module, all four
  locales required per key) and are merged in `i18n/messages.ts`; components
  render via `useLanguage().t(key, values)` with `{{placeholder}}`
  interpolation. Never hardcode user-visible text in JSX.

### Admin (`admin/src`)

- `App.tsx`: admin shell and catalog refresh.
- `components/ContentAdmin.tsx`: management workspace composition.
- `components/admin/`: six workspaces — directory / courses / importer /
  recorder / feedback / users. Components: `AdminHeader` (operator identity,
  login, status), `AdminWorkspaceNav`, `DirectoryManager` (content categories +
  learning series), `CourseManager` (course metadata), `MediaCourseForm`,
  `MediaWaveform` (wavesurfer waveform + region-based sentence timeline
  editing), `SubtitleImporter` (subtitle text/file import — SRT/VTT/ASS/LRC/TXT
  with automatic format and bilingual detection), `ListeningVideoRecorder`
  (auto-playback screen recording of published courses), `CoverImageField`,
  `AcceptedAnswerFeedbackPanel` (feedback center), `UserActivityPanel` (user
  activity report).
- `components/AudioLessonImporter.tsx`: real media course-import workflow.
- `lib/`: API client and draft/transcript conversion helpers.

### Mobile app (`mobile-app`)

- `app/`: expo-router routes — `(tabs)/` (index, leaderboard, growth, account),
  `auth/login`, `series/` (list), `study/[seriesId]/[exerciseId]`, `vocabulary`.
- `src/`: `features/` (account, auth, catalog, feedback, progress, study),
  `stores/` (zustand: authStore, navigationStore, studyStore), `components/`,
  `hooks/`, `lib/`, `providers/`, `services/`.

## Core Data Model

Admin uses production content terms; the learner app may render the same data
playfully (a learning series can look like a map, a course like a level).
Database and Admin labels stay precise.

| Domain object | Table | Notes |
| --- | --- | --- |
| Content category | `category_groups` | Top-level material type (news, interviews, exams, ...); ordered by `sort_order`. |
| Learning series | `categories` | Curated sequence in one category; parent stored as `group_id`. |
| Course | `exercises` | One listenable unit; parent series as `category_id`; timed transcript lines in `transcript_json`. |
| Learner account | `users` | Login identity and token. |
| Admin account | `admin_users` | Operator login identity and token. |
| Course progress | `exercise_progress` | Per-user course-level preferences and last sentence. |
| Sentence progress | `line_progress` | Unclear/mastered flags, repeat count, notes, dictation. |
| Vocabulary item | `vocabulary_items` | User vocabulary collected from course context. |
| User session | `user_sessions` | Active login sessions. |

## Database Rules

- The authoritative schema source is `infra/mysql/migrations` (Flyway).
  Versioned files `VyyyyMMddNNNN__description.sql` for table/column/index
  changes; repeatable `R__*.sql` only for tiny stable built-in reference rows.
  `infra/mysql/init.sql` is a legacy local bootstrap snapshot only.
- Migration files are immutable once applied to any shared/production database —
  add a new versioned migration instead. Keep `create table if not exists`
  idempotency for first-time adoption against existing databases.
- Runtime application code must not create, alter, or seed tables.
- Every table uses `id bigint unsigned auto_increment primary key`. No parallel
  `code` identifier system; reference content by auto-increment id.
- No database-level foreign keys. Relationship columns (`group_id`,
  `category_id`, `exercise_id`, `user_id`) are ordinary indexed columns;
  backend and Admin workflows own validation.
- Do not put seed catalog data, built-in lessons, or test content into
  migrations or application code. The learner app only consumes published
  catalog data from the API.
- Sentence-level playback depends on exact `start`/`end` values in
  `exercises.transcript_json` matching the media timeline — keep timing on the
  course record.

## Frontend API Base URL Rules

- In production, all browser frontends (`web-app`, `admin`, Expo Web export of
  `mobile-app`) must use same-origin API requests: leave `VITE_API_BASE_URL` /
  `EXPO_PUBLIC_API_BASE_URL` empty so requests go to `/api/v1/...` on the same
  host; each frontend nginx container proxies `/api/` to `backend:4000`.
- Never bake `http://127.0.0.1:8100` into a production frontend bundle — in a
  user's browser that is the user's own device. Never set the base to `/api`
  either — API client paths already include `/api/v1/...`, which would produce
  `/api/api/v1/...` 404s.
- Explicit base URLs are only for local development or native-device testing,
  e.g. `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:4000 npm run dev:mobile-app`.

## Project Boundaries

- Keep `backend`, `web-app`, `admin`, and `mobile-app` as separate projects.
- Keep learner-facing UI playful; keep Admin professional and operational.
- Database schema changes belong in explicit SQL under `infra/mysql/migrations`.

## Deployment

- Do not push changes to the server on every edit — only deploy when the user
  explicitly asks in the current conversation.
- Production hosts, addresses, credentials, database names, and operational
  deployment steps are private. Keep them only in the ignored local runbook
  `temp/deployment-runbook.local.md`; do not copy them into tracked files,
  commits, logs, or chat output.
- When deployment is explicitly requested, read that local runbook first and
  follow its service order. If it is unavailable, stop and ask the project
  owner instead of inferring production details.
- All five application images use the same local delivery path: run
  `DEPLOY_HOST=<ssh-host> npm run deploy:images -- <explicit-services>` to
  build with `--pull=false`, apply the stable production tag, stream
  `docker image save`/`load`, and compare local/server image IDs. The server
  must never build application Dockerfiles. Complete any Flyway gate before
  switching only the named services with `--no-build --no-deps`; never include
  MySQL or MinIO.
- Synchronize server-side source only through
  `DEPLOY_HOST=<ssh-host> npm run deploy:sync-sources -- deployment [official-site]`.
  It derives separate Git-tracked manifests for deployment configuration and
  official-site source, so it does not scan or transfer local dependencies,
  build outputs, `temp` directories, nested Git metadata, caches, or `.env`.

## Security Considerations

- Secrets live in `.env` / `backend/.env` (not committed; `.env.example` is the
  template): MySQL credentials, MinIO keys, `AUTH_TOKEN_SECRET`/`SECRET_JWT`,
  `RESEND_API_KEY`, CORS origins. Never commit real secrets or print them.
- Production frontend build args for API base URLs must stay empty strings (see
  the API base URL rules above).
- The permissive loopback/private-LAN CORS patterns in `backend/src/app.ts` are
  development-only (`env.isDevelopment`); do not broaden production CORS.
- Admin write endpoints require an admin bearer token; do not expose them
  through learner clients.
- `docker-compose.yml` default credentials (`duolinting`/`duolinting`,
  `minioadmin`/`minioadmin`) are for local development only; production values
  come from the server `.env`.
