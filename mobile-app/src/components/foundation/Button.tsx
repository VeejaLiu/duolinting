import { Pressable, Text, type PressableProps } from 'react-native'

type ButtonProps = PressableProps & {
  label: string
  tone?: 'primary' | 'secondary' | 'ghost' | 'success' | 'neutral'
}

export function Button({
  label,
  tone = 'primary',
  ...props
}: ButtonProps) {
  const disabled = Boolean(props.disabled)
  const baseClassName = `min-h-[48px] items-center justify-center rounded-pill border-2 px-5 py-3 ${
    disabled ? 'opacity-50' : ''
  }`
  const className =
    tone === 'primary' || tone === 'success'
      ? `${baseClassName} border-[#58cc02] border-b-[5px] bg-success border-b-[#46a302]`
      : tone === 'secondary'
        ? `${baseClassName} border-[#d7e2ee] border-b-[5px] bg-white border-b-[#d7e4ef]`
        : tone === 'neutral'
          ? `${baseClassName} border-[#d7e2ee] border-b-[5px] bg-surface-raised border-b-[#d7e4ef]`
          : `min-h-[48px] items-center justify-center rounded-pill px-5 py-3 ${
              disabled ? 'opacity-50' : ''
            }`

  const textClassName =
    tone === 'primary' || tone === 'success'
      ? 'text-center text-base font-black text-white'
      : tone === 'ghost'
        ? 'text-center text-base font-black text-brand'
        : 'text-center text-base font-black text-text-primary'

  return (
    <Pressable className={className} {...props}>
      <Text className={textClassName}>{label}</Text>
    </Pressable>
  )
}
