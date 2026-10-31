import assert from 'node:assert/strict'
import test from 'node:test'
import type { CatalogResponse, ListeningExercise, CatalogExerciseSummary } from '@duolinting/domain'
import { mountHook } from './hookHarness'
import type { useCatalog } from '../src/hooks/useCatalog'
import type { useExerciseDetail } from '../src/hooks/useExerciseDetail'
import type { useCategoryExercises } from '../src/hooks/useCategoryExercises'

const path = (file: string) => new URL(`../src/hooks/${file}.ts`, import.meta.url).pathname
const catalog: CatalogResponse = { categoryGroups: [], categories: [{ id: 1, groupId: 1, name: 'Series', description: '', accent: '#1cb0f6', sortOrder: 1 }], exercises: [] }
const course: ListeningExercise = { id: 1, categoryId: 1, title: 'First', source: '', difficulty: 'beginner', durationLabel: '0:01', mediaType: 'audio', audioUrl: '', summary: '', status: 'published', sortOrder: 1, lines: [{ id: 'line-1', start: 0, end: 1, text: 'Hello.', translation: '', answers: [], keywords: [] }] }
const { lines: _lines, ...metadata } = course
const summary: CatalogExerciseSummary = { ...metadata, lineCount: 1 }
const setStore = () => undefined
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

test('catalog failure exposes a retry that recovers without remounting', async () => {
  let fail = true
  const next = deferred<typeof catalog>()
  const hook = await mountHook<ReturnType<typeof useCatalog>>(path('useCatalog'), 'useCatalog', {
    getCatalog: () => fail ? Promise.reject(new Error('offline')) : next.promise,
  }, ['en-US'])
  try {
    assert.equal((await hook.settle()).catalogLoadFailed, true)
    fail = false
    hook.current().retryCatalog()
    assert.equal(hook.current().catalogLoading, true)
    next.resolve(catalog)
    assert.equal((await hook.settle()).catalog, catalog)
    assert.equal(hook.current().catalogLoadFailed, false)
  } finally { hook.unmount() }
})

test('catalog changes hide old account or language content immediately and retry only the new scope', async () => {
  for (const nextScope of [['en-US', 'new-session'], ['ja-JP', 'old-session']]) {
    let failNewScope = true
    const nextCatalog: CatalogResponse = { ...catalog, categories: [{ ...catalog.categories[0], id: 2, name: 'New scope' }] }
    const hook = await mountHook<ReturnType<typeof useCatalog>>(path('useCatalog'), 'useCatalog', {
      getCatalog: (locale: string, token: string) => locale === 'en-US' && token === 'old-session'
        ? Promise.resolve(catalog)
        : failNewScope ? Promise.reject(new Error('offline')) : Promise.resolve(nextCatalog),
    }, ['en-US', 'old-session'])
    try {
      assert.equal((await hook.settle()).catalog, catalog)
      const beforeFetchEffect = hook.beforeEffects(nextScope)
      assert.deepEqual(beforeFetchEffect.catalog.categories, [])
      assert.equal(beforeFetchEffect.catalogLoaded, false)
      await hook.settle()
      assert.equal(hook.current().catalogLoadFailed, true)
      assert.deepEqual(hook.current().catalog.categories, [])
      failNewScope = false
      hook.current().retryCatalog()
      assert.equal((await hook.settle()).catalog, nextCatalog)
      assert.equal(hook.current().catalogLoaded, true)
    } finally { hook.unmount() }
  }
})

test('exercise refresh failure keeps already loaded course content', async () => {
  let fail = false
  const hook = await mountHook<ReturnType<typeof useExerciseDetail>>(path('useExerciseDetail'), 'useExerciseDetail', {
    getExercise: () => fail ? Promise.reject(new Error('offline')) : Promise.resolve(course),
  }, [{ activeExerciseSummary: summary, setStore, contentLocale: 'en-US' }])
  try {
    assert.equal((await hook.settle()).activeExercise, course)
    fail = true
    hook.current().retryExercise()
    await hook.settle()
    assert.equal(hook.current().activeExercise, course)
    assert.equal(hook.current().exerciseLoadFailed, true)
  } finally { hook.unmount() }
})

test('category failure is recorded and resolves safely, then a retry supplies chapters', async () => {
  let fail = true
  const chapters = [summary]
  const hook = await mountHook<ReturnType<typeof useCategoryExercises>>(path('useCategoryExercises'), 'useCategoryExercises', {
    getCategoryExercises: () => fail ? Promise.reject(new Error('offline')) : Promise.resolve(chapters),
  }, ['en-US'])
  try {
    assert.equal(await hook.current().loadExercises(1), undefined)
    assert.equal(hook.current().failedCategoryIds[1], true)
    fail = false
    await hook.current().loadExercises(1)
    assert.equal(hook.current().failedCategoryIds[1], undefined)
    assert.deepEqual(hook.current().exercisesByCategory[1], chapters)
  } finally { hook.unmount() }
})

test('late category responses from the previous language cannot replace new chapters', async () => {
  const old = deferred<CatalogExerciseSummary[]>()
  const hook = await mountHook<ReturnType<typeof useCategoryExercises>>(path('useCategoryExercises'), 'useCategoryExercises', {
    getCategoryExercises: (_id: number, locale: string) => locale === 'en-US' ? old.promise : Promise.resolve([{ ...summary, id: 2 }]),
  }, ['en-US'])
  try {
    const first = hook.current().loadExercises(1)
    hook.update(['ja-JP'])
    await hook.current().loadExercises(1)
    old.resolve([summary])
    await first
    assert.deepEqual(hook.current().exercisesByCategory[1].map((item) => item.id), [2])
  } finally { hook.unmount() }
})
