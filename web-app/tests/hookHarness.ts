import { build } from 'esbuild'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The repository has no DOM test runtime. Exercise hooks directly with a tiny
// effect/state host; only React scheduling and the remote API are substituted.
export async function mountHook<T>(entry: string, name: string, api: object, initialArgs: unknown[]) {
  const slots: { value?: unknown; deps?: unknown[]; cleanup?: () => void }[] = []
  let cursor = 0
  let dirty = false
  let args = initialArgs
  let pending: (() => void)[] = []
  let result: T
  const changed = (a?: unknown[], b?: unknown[]) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]))
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++
      const slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slot.value, (next: unknown) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true }
      }]
    },
    useRef(initial: unknown) { return (slots[cursor++] ??= { value: { current: initial } }).value },
    useCallback(callback: unknown, deps: unknown[]) {
      const slot = slots[cursor++] ??= {}
      if (changed(slot.deps, deps)) { slot.value = callback; slot.deps = deps }
      return slot.value
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const slot = slots[cursor++] ??= {}
      if (changed(slot.deps, deps)) {
        slot.deps = deps
        pending.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined })
      }
    },
  }
  const key = `hook-${randomUUID()}`
  ;(globalThis as Record<string, unknown>)[key] = { hooks, api }
  const bundle = await build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'test-boundaries', setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'test' }))
      build.onResolve({ filter: /\/apiClient$/ }, () => ({ path: 'api', namespace: 'test' }))
      build.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'react'
        ? `export const { useState, useRef, useCallback, useEffect } = globalThis[${JSON.stringify(key)}].hooks`
        : `export const apiClient = globalThis[${JSON.stringify(key)}].api` }))
    } }],
  })
  const directory = mkdtempSync(join(tmpdir(), 'duolinting-recovery-'))
  const modulePath = join(directory, 'hook.mjs')
  writeFileSync(modulePath, bundle.outputFiles[0].text)
  const module = await import(pathToFileURL(modulePath).href)
  const render = () => {
    let passes = 0
    do {
      if (++passes > 20) throw new Error('Hook did not settle')
      dirty = false; cursor = 0
      result = module[name](...args)
      const effects = pending; pending = []
      effects.forEach((effect) => effect())
    } while (dirty)
    return result
  }
  render()
  return {
    current: () => render(),
    update: (next: unknown[]) => { args = next; return render() },
    beforeEffects: (next: unknown[]) => {
      args = next; cursor = 0
      result = module[name](...args)
      return result
    },
    async settle() { render(); await new Promise((resolve) => setImmediate(resolve)); return render() },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.())
      delete (globalThis as Record<string, unknown>)[key]
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
