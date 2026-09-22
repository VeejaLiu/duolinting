# Content workspace hooks

`components/ContentAdmin.tsx` composes the workspace panels. These hooks retain
its existing state and operations without changing component mounting or API
contracts:

- `useImporterNavigation`: routes, importer drafts, sidebar navigation and the
  shared save/discard/cancel guard for navigation, browser history and logout.
- `useCatalogActions`: directory forms, shared saving state, directory mutations,
  course deletion and course ordering. Ordering still refreshes the complete
  course list before finding neighbours and preserves sequential writes.
- `useWorkspaceData`: section-dependent catalog, contributor, task, notification,
  feedback and growth data, plus the current review dialog state.

The account settings UI is in `components/admin/AccountSettingsPanel.tsx`.
Shared workspace input types live in `components/admin/content-workspace/types.ts`.
These are internal implementation details; `ContentAdmin` keeps the same props.
