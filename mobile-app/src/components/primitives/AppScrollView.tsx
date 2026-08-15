import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import type { ScrollViewProps } from 'react-native'
import { cssInterop } from 'nativewind'

// 第三方滚动组件默认不识别 NativeWind 的 className；在统一封装处注册，
// 让既有页面与后续表单都能直接沿用项目的样式写法。
const KeyboardAwareAppScrollView = cssInterop(KeyboardAwareScrollView, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
})

type AppScrollViewProps = ScrollViewProps & {
  className?: string
  contentContainerClassName?: string
  /** 键盘与焦点输入框之间的最小可视间距，单位为逻辑像素。 */
  extraHeight?: number
  /** Android 上启用焦点输入框自动滚入可视区。 */
  enableOnAndroid?: boolean
  /** 键盘隐藏后是否回到页面原本滚动位置。 */
  enableResetScrollToCoords?: boolean
}

/**
 * 应用级可滚动容器。
 *
 * `KeyboardAwareScrollView` 会在输入框获得焦点时自动将其滚入键盘上方；
 * 它只使用 React Native 的键盘事件，因此可直接在 Expo Go 中调试。所有
 * 可输入页面应优先使用它，以保证新增输入框时也能自动避让键盘。
 */
export function AppScrollView(props: AppScrollViewProps) {
  return (
    <KeyboardAwareAppScrollView
      enableAutomaticScroll
      enableOnAndroid
      enableResetScrollToCoords={false}
      extraHeight={20}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      {...props}
    />
  )
}
