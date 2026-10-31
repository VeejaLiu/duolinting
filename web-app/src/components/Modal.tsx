import * as Dialog from '@radix-ui/react-dialog'
import { useRef, type ReactNode } from 'react'

type ModalProps = {
  children: ReactNode
  className: string
  backdropClassName?: string
  onClose: () => void
}

/** Shared focus/dismissal boundary for the app's externally controlled dialogs. */
export function Modal({ children, className, backdropClassName = 'modal-backdrop', onClose }: ModalProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null)

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className={backdropClassName}>
          <Dialog.Content
            asChild
            aria-describedby={undefined}
            onOpenAutoFocus={() => {
              // These dialogs are opened by controls outside Dialog.Root, so
              // Radix has no Trigger ref. Capture it before initial focus moves.
              returnFocusRef.current = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              if (returnFocusRef.current?.isConnected) {
                returnFocusRef.current.focus({ preventScroll: true })
              }
            }}
          >
            <section aria-modal="true" className={className}>{children}</section>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export const ModalTitle = Dialog.Title
