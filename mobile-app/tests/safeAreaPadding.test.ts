import assert from 'node:assert/strict'
import test from 'node:test'
import { createSafeAreaPadding } from '../src/lib/safeAreaPadding'

const insets = { top: 47, right: 0, bottom: 34, left: 0 }

test('native safe-area padding keeps measured insets and additional spacing', () => {
  assert.deepEqual(createSafeAreaPadding(insets, { top: 10, bottom: 16 }, false), {
    paddingTop: 57,
    paddingBottom: 50,
  })
})

test('web safe-area padding uses CSS values when Router measurements are disabled', () => {
  assert.deepEqual(createSafeAreaPadding(insets, { top: 10, bottom: 16 }, true), {
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  })
})

test('screen padding includes selected zero-offset edges without adding a bottom inset', () => {
  assert.deepEqual(createSafeAreaPadding(insets, { top: 0, left: 0, right: 0 }, false), {
    paddingTop: 47,
    paddingLeft: 0,
    paddingRight: 0,
  })
  assert.deepEqual(createSafeAreaPadding(insets, {}, true), {})
})
