import * as Select from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'

type SettingsSelectProps = {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  ariaLabel: string
}

/**
 * 设置页下拉框：Radix Select + 多邻国 chunky 样式。
 * 触发器与输入框同一套粗描边语言，浮层卡片厚底边、选项 hover 品牌蓝，
 * 不用浏览器原生 select 的原生外观。
 */
export function SettingsSelect({ value, options, onChange, ariaLabel }: SettingsSelectProps) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger aria-label={ariaLabel} className="settings-select-trigger">
        <Select.Value />
        <Select.Icon aria-hidden="true">
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="settings-select-content" position="popper" sideOffset={6}>
          <Select.Viewport className="settings-select-viewport">
            {options.map((option) => (
              <Select.Item
                className="settings-select-item"
                key={option.value}
                value={option.value}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator aria-hidden="true" className="settings-select-item-indicator">
                  <Check size={15} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
