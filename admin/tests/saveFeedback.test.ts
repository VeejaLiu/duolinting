import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const directory = mkdtempSync(join(tmpdir(), 'duolinting-save-feedback-'))
const output = join(directory, 'form.cjs')
let renderForm: (props: Record<string, unknown>) => string
try {
  await build({
    stdin: {
      contents: `
        import { createElement } from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { MediaCourseForm } from './admin/src/components/admin/MediaCourseForm';
        import { AdminLanguageProvider } from './admin/src/i18n/AdminLanguageProvider';
        export const renderForm = (props) => renderToStaticMarkup(createElement(
          AdminLanguageProvider, null, createElement(MediaCourseForm, {
            adminToken: '', categoriesByGroup: [],
            courseForm: { categoryId: 1, title: 'Lesson', source: '', difficulty: 'beginner', durationLabel: '0:01', mediaType: 'audio', audioUrl: '/local.wav', summary: '', status: 'draft', sortOrder: 1 },
            isSaving: false, localMediaUrl: '', mediaSize: null, mediaFile: null,
            mediaUploadProgress: null, mediaRef: { current: null }, previewLines: [],
            clipboardPanel: { mode: 'hidden' }, onCourseFormChange() {},
            onClipboardPanelChange() {}, onManualDltjsonImport() {}, onNotify() {},
            onFileChange() {}, onSaveLesson() {}, ...props,
          })
        ));`,
      resolveDir: projectRoot, loader: 'tsx',
    },
    outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env': '{}', 'window.location.search': '""' },
    plugins: [{ name: 'installed-packages', setup(bundle) {
      bundle.onResolve({ filter: /^[^./]/ }, (args) => {
        // Workspace contracts expose ESM imports only; let esbuild include them.
        if (args.path.startsWith('@duolinting/')) return undefined
        return {
          path: require.resolve(args.path, { paths: [args.importer ? dirname(args.importer) : projectRoot] }),
          external: true,
        }
      })
    } }],
    logLevel: 'silent',
  })
  // Only the language preference is needed in SSR; effects and remote calls do
  // not run. Never read or alter the user's browser/session storage in tests.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'en-US' } })
  renderForm = require(output).renderForm
} finally {
  rmSync(directory, { recursive: true, force: true })
}

function feedback(html: string) {
  const paragraph = html.match(/<p\b[^>]*class="import-save-feedback"[^>]*>[\s\S]*?<\/p>/)?.[0]
  assert.ok(paragraph, 'Expected the persistent save-guidance element')
  return paragraph
}

test('a temporary drag lock disables save while the feedback slot stays empty', () => {
  const html = renderForm({ saveDisabledReason: '请松开鼠标完成字幕拖动后再保存', saveFeedbackReason: '' })
  assert.match(feedback(html), />\s*<\/p>$/)
  assert.doesNotMatch(feedback(html), /Release|松开/)
  assert.match(html, /<button\b[^>]*class="command-button meta-save-command"[^>]*disabled=""/)
})

test('saving uses the existing button while the feedback slot stays empty', () => {
  const html = renderForm({ isSaving: true, saveDisabledReason: '', saveFeedbackReason: '' })
  assert.match(feedback(html), />\s*<\/p>$/)
  assert.match(html, /aria-busy="true"/)
})

test('persistent guidance is unchanged while a drag temporarily blocks saving', () => {
  const before = feedback(renderForm({ saveDisabledReason: '请先选择音频或视频文件', saveFeedbackReason: '请先选择音频或视频文件' }))
  const during = feedback(renderForm({ saveDisabledReason: '请松开鼠标完成字幕拖动后再保存', saveFeedbackReason: '请先选择音频或视频文件' }))
  assert.equal(during, before)
  assert.match(during, /Select an audio or video file first/)
})

test('save guidance is inside the title toolbar before subtitle import actions', () => {
  const html = renderForm({ saveDisabledReason: '请先选择音频或视频文件', saveFeedbackReason: '请先选择音频或视频文件' })
  const toolbar = html.indexOf('<div class="import-main-toolbar">')
  const hint = html.indexOf(feedback(html))
  const actions = html.indexOf('<div class="import-main-toolbar-actions">')
  assert.ok(toolbar >= 0 && toolbar < hint && hint < actions, 'Guidance belongs before the action buttons')
  // Count rendered div boundaries to ensure the hint is a direct toolbar child,
  // rather than a separate header row that can displace the player.
  const prefix = html.slice(toolbar, hint)
  assert.equal((prefix.match(/<div\b/g)?.length ?? 0) - (prefix.match(/<\/div>/g)?.length ?? 0), 1)
  assert.match(feedback(html), /title="Select an audio or video file first\."/)
})
