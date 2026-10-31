export type StudyShortcutEvent = Pick<KeyboardEvent,
  'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing' |
  'keyCode' | 'defaultPrevented' | 'repeat'>

type StudyShortcutContext = { interactiveTarget: boolean; overlayOpen: boolean }

const interactiveSelector = [
  'input', 'textarea', 'select', 'button', 'a[href]', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]', '[role="combobox"]', '[role="slider"]',
  '[role="button"]', '[role="tab"]', '[role="menuitem"]',
].join(', ')
const overlaySelector = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]'

export function getStudyShortcutContext(event: KeyboardEvent): StudyShortcutContext {
  // A portalled Radix popover/menu is outside the stage DOM. Check the document
  // too, so its arrow/space handling cannot also navigate or play the lesson.
  const target = event.target instanceof Element ? event.target : null
  return {
    interactiveTarget: Boolean(target?.closest(interactiveSelector)),
    overlayOpen: Boolean(document.querySelector(overlaySelector)),
  }
}

export function getStudyShortcutAction(event: StudyShortcutEvent, context: StudyShortcutContext) {
  // Only unmodified, unconsumed keys belong to the learning shortcuts. 229 is
  // retained for IME browsers that report composition before isComposing flips.
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    context.interactiveTarget || context.overlayOpen) return null

  // Holding arrows may navigate sentences; holding a toggle must not undo the
  // same progress flag or restart/pause playback repeatedly.
  if (event.repeat && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return null

  switch (event.key.toLowerCase()) {
    case 'arrowleft': return 'previous'
    case 'arrowright': return 'next'
    case ' ': return 'playback'
    case 'f': return 'mastered'
    case 'd': return 'unclear'
    case 'r': return 'reveal'
    default: return null
  }
}
