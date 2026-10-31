import assert from 'node:assert/strict'
import test from 'node:test'
import { getStudyShortcutAction, type StudyShortcutEvent } from '../src/lib/studyShortcuts.ts'

const plainEvent: StudyShortcutEvent = {
  key: 'f', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false,
  isComposing: false, keyCode: 70, defaultPrevented: false, repeat: false,
}
const studyContext = { interactiveTarget: false, overlayOpen: false }

// These cases catch a browser/editor key combination changing learning progress.
test('browser commands and modified keys leave the course untouched', () => {
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const) {
    assert.equal(getStudyShortcutAction({ ...plainEvent, [modifier]: true }, studyContext), null, modifier)
  }
})

test('text composition and already handled events leave the course untouched', () => {
  assert.equal(getStudyShortcutAction({ ...plainEvent, isComposing: true }, studyContext), null)
  assert.equal(getStudyShortcutAction({ ...plainEvent, keyCode: 229 }, studyContext), null)
  assert.equal(getStudyShortcutAction({ ...plainEvent, defaultPrevented: true }, studyContext), null)
})

test('form controls and open overlays own their keyboard input', () => {
  assert.equal(getStudyShortcutAction(plainEvent, { ...studyContext, interactiveTarget: true }), null)
  assert.equal(getStudyShortcutAction({ ...plainEvent, key: 'ArrowRight' }, { ...studyContext, overlayOpen: true }), null)
})

test('holding an action key does not repeatedly toggle progress or playback', () => {
  for (const key of ['f', 'd', 'r', ' ']) {
    assert.equal(getStudyShortcutAction({ ...plainEvent, key, repeat: true }, studyContext), null, key)
  }
})

test('plain study keys keep navigation, playback and progress shortcuts', () => {
  for (const [key, expected] of [
    ['ArrowLeft', 'previous'], ['ArrowRight', 'next'], [' ', 'playback'],
    ['f', 'mastered'], ['F', 'mastered'], ['d', 'unclear'], ['r', 'reveal'],
    ['Escape', null], ['Enter', null],
  ] as const) {
    assert.equal(getStudyShortcutAction({ ...plainEvent, key }, studyContext), expected, key)
  }
  // Arrow repetition is intentional sentence navigation; toggle keys are one-shot.
  assert.equal(getStudyShortcutAction({ ...plainEvent, key: 'ArrowRight', repeat: true }, studyContext), 'next')
})
