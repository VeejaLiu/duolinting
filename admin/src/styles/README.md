# Admin styles

`../index.css` contains global defaults. `../App.css` loads the application styles
in this order: `shell.css`, `forms.css`, `content.css`, `interactions.css`, then
`responsive.css`.

`content.css` and `responsive.css` are import manifests. Add or edit business
styles in the relevant module rather than appending rules to these manifests.

| Directory / file | Responsibility |
| --- | --- |
| `shell.css` | Application shell, navigation and general page structure |
| `forms.css` | Shared form fields and controls |
| `interactions.css` | Shared hover behavior and AI action buttons |
| `shared/` | Shared workspace layout and cross-page breakpoints |
| `directory/` | Directory tree, legacy menu and directory editor |
| `courses/` | Course list, filters, workflow display and batch import |
| `course-editor/` | Workbench layout, metadata drawer, select controls, read-only information and AI tools |
| `subtitles/` | Inspector, sentence editing, waveform, import and history |
| `media/` | Upload, cover selection and audio/video preview |
| `recorder/` | Recording canvas, branding, fullscreen and recording-specific breakpoints |
| `workflow/` | Task pool, personal tasks and activity timeline |
| `people/` | Hierarchical course access assignments |
| `feedback/` | Answer feedback display |
| `integrations/` | Open Content API documentation |

## Cascade and responsive rules

The manifests retain the original rule order. Some modules have separate files
for later additions (for example, `directory/editor.css` and
`course-editor/readonly.css`); this preserves their priority over earlier shared
rules. Do not alphabetize the imports or move imports into individual React
components: either can change which rule wins.

Component-specific media/container queries stay with their component styles.
The late, cross-workspace breakpoint rules live in `shared/responsive.css` and
`course-editor/responsive.css`, loaded by `responsive.css`. Keep these after
`interactions.css` so the existing narrow-screen and desktop overrides retain
their priority.

This split does not rename selectors, remove legacy rules, merge duplicate
rules, or change declarations. Those are separate behavioral changes and should
be reviewed independently.
