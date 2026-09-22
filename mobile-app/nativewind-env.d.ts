import type {
  ImagePropsBase,
  ScrollViewProps,
  ScrollViewPropsAndroid,
  ScrollViewPropsIOS,
  Touchable,
  ViewProps,
  VirtualizedListProps,
} from 'react-native'

// Keep NativeWind's React Native prop augmentation inside the mobile workspace.
// The monorepo root also contains a newer React Native version; referencing
// nativewind/types from the hoisted package would augment that unrelated copy.
declare module '@react-native/virtualized-lists' {
  interface VirtualizedListWithoutRenderItemProps<ItemT> extends ScrollViewProps {
    ListFooterComponentClassName?: string
    ListHeaderComponentClassName?: string
  }
}

declare module 'react-native' {
  interface ScrollViewProps
    extends ViewProps,
      ScrollViewPropsIOS,
      ScrollViewPropsAndroid,
      Touchable {
    contentContainerClassName?: string
    indicatorClassName?: string
  }

  interface FlatListProps<ItemT> extends VirtualizedListProps<ItemT> {
    columnWrapperClassName?: string
  }

  interface ImageBackgroundProps extends ImagePropsBase {
    imageClassName?: string
  }

  interface ImagePropsBase {
    className?: string
    cssInterop?: boolean
  }

  interface ViewProps {
    className?: string
    cssInterop?: boolean
  }

  interface TextInputProps {
    placeholderClassName?: string
  }

  interface TextProps {
    className?: string
    cssInterop?: boolean
  }

  interface SwitchProps {
    className?: string
    cssInterop?: boolean
  }

  interface InputAccessoryViewProps {
    className?: string
    cssInterop?: boolean
  }

  interface TouchableWithoutFeedbackProps {
    className?: string
    cssInterop?: boolean
  }

  interface StatusBarProps {
    className?: string
    cssInterop?: boolean
  }

  interface KeyboardAvoidingViewProps extends ViewProps {
    contentContainerClassName?: string
  }

  interface ModalBaseProps {
    presentationClassName?: string
  }
}
