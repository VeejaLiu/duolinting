import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
import { useLanguage } from '../i18n/LanguageProvider'

type TooltipProps = {
  children: ReactNode
  label: string
  shortcut?: string
}

export function Tooltip({ children, label, shortcut }: TooltipProps) {
  const { t } = useLanguage()
  return (
    <TooltipPrimitive.Provider delayDuration={800}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="bottom"
            sideOffset={6}
            className="custom-tooltip"
          >
            <div className="custom-tooltip-label">{label}</div>
            {shortcut && (
              <div className="custom-tooltip-shortcut">{t('tooltip.shortcut', { shortcut })}</div>
            )}
            <TooltipPrimitive.Arrow className="custom-tooltip-arrow" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
