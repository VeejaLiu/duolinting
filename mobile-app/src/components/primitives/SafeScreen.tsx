import { PropsWithChildren } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'

export function SafeScreen({ children }: PropsWithChildren) {
  /*
   * 底部 Tab Navigator 已经为 iPhone Home Indicator 计算安全区。
   * 页面再加 bottom inset 会把内容区向上挤出一段空白；这里仅保留
   * 顶部和横向安全区，非 Tab 页的滚动内容自行保留底部内边距。
   */
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
      {children}
    </SafeAreaView>
  )
}
