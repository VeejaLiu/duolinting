import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { adminMessages } from '../admin/src/i18n/messages.ts'
import { directoryName, courseTitle, workflowCourseTitle } from '../admin/src/lib/localizedContent.ts'
import { parseWorkflowLocalizations } from '../backend/src/general/admin/workflow-localizations.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const locales = ['zh-CN', 'en-US', 'th-TH', 'ja-JP', 'fr-FR', 'es-ES']
const keys = new Set(Object.values(adminMessages).flatMap(Object.keys))
const placeholders = (text) => (text.match(/\{\{[^}]+\}\}/g) ?? []).sort()
for (const key of keys) {
  for (const locale of locales) {
    const message = adminMessages[locale][key]
    assert.ok(typeof message === 'string' && message.trim(), `Missing ${locale}: ${key}`)
    assert.deepEqual(placeholders(message), placeholders(key), `Placeholders differ in ${locale}: ${key}`)
  }
}

// Check literal and conditional translation calls, plus menu label objects, so new UI copy cannot silently fall back.
const required = new Set()
function collect(node) {
  if (ts.isStringLiteral(node) && /[\u4e00-\u9fff]/.test(node.text)) required.add(node.text)
  ts.forEachChild(node, collect)
}
function inspect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'i18n') inspect(file)
    } else if (/\.tsx?$/.test(file)) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0]) collect(node.arguments[0])
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'label' && ts.isStringLiteral(node.initializer)) collect(node.initializer)
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'eventTagLabel' && node.initializer) collect(node.initializer)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
}
inspect(path.join(root, 'admin/src'))
for (const key of required) {
  for (const locale of locales) assert.ok(adminMessages[locale][key], `UI key missing in ${locale}: ${key}`)
}

// The screenshots exposed display paths using raw names. Verify localized labels and safe English fallback.
const directory = { name: 'Animation', localizations: { 'zh-CN': { name: '动画片' }, 'fr-FR': { name: 'Animation française' } } }
const course = { title: 'A school day', localizations: { 'zh-CN': { title: '校园的一天' }, 'es-ES': { title: 'Un día de escuela' } } }
const original = JSON.stringify({ directory, course })
assert.equal(directoryName(directory, 'zh-CN'), '动画片')
assert.equal(directoryName(directory, 'en-US'), 'Animation')
assert.equal(directoryName(directory, 'es-ES'), 'Animation')
assert.equal(courseTitle(course, 'es-ES'), 'Un día de escuela')
assert.equal(courseTitle(course, 'en-US'), 'A school day')
assert.equal(JSON.stringify({ directory, course }), original, 'Display localization mutated source content')
for (const source of [course.localizations, JSON.stringify(course.localizations)]) {
  const localizations = parseWorkflowLocalizations(source)
  assert.equal(workflowCourseTitle({ exerciseTitle: course.title, exerciseLocalizations: localizations }, 'zh-CN'), '校园的一天')
}
assert.deepEqual(parseWorkflowLocalizations('invalid JSON'), {})
assert.deepEqual(parseWorkflowLocalizations({ 'fr-FR': { title: 12 }, 'es-ES': { title: '  ' } }), {})
assert.equal(adminMessages['zh-CN']['提交校对'], '提交校对')
assert.equal(adminMessages['zh-CN']['全部动态'], '全部动态')
assert.equal(adminMessages['zh-CN']['我的任务'], '我的任务')
console.log(`Admin i18n checks passed: ${keys.size} keys across six languages, ${required.size} UI keys, localized content and workflow titles.`)
