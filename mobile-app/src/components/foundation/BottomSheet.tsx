import { FontAwesome6 } from '@expo/vector-icons'
import { PropsWithChildren, useEffect, useRef } from 'react'
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * 通用底部弹层（对标多邻国"连胜详情"的底部弹出页）。
 *
 * 为什么用 RN 自带 Modal 而不是 @gorhom/bottom-sheet 这类库：
 * - 零新增依赖，项目当前没有任何手势/动画库，为一个弹层引入整条
 *   reanimated + gesture-handler 链不划算；
 * - 这里的弹层是纯展示内容，不需要拖拽手势/半截吸附等高级交互。
 *
 * 动画口径（为什么不能直接用 Modal 的 animationType="slide"）：
 * "slide"会把整个 Modal 内容——包括背板——一起从底部推上来，
 * 黑色背板跟着内容滑动非常难看。正确效果是：
 * - 背板：原地渐显（opacity 0 → 1）；
 * - 内容区：从屏幕底部上滑（translateY 屏高 → 0）。
 * 所以这里 animationType="none"，两条动画用 Animated 独立驱动；
 * 关闭时先反向播完再通知父组件卸载，避免"none"下瞬间消失。
 *
 * 结构注意：nativewind 不会对 Animated.View 做 className 样式编译，
 * 所以 Animated.View 只挂 inline style（transform），
 * 白底/圆角等 className 样式放在内层普通 View 上。
 */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
}: PropsWithChildren<{
  visible: boolean
  title: string
  onClose: () => void
}>) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const sheetTranslateY = useRef(new Animated.Value(windowHeight)).current

  // 打开：背板渐显（200ms）与内容区上滑（280ms 缓出）并行、互不干扰
  useEffect(() => {
    if (!visible) {
      return
    }

    backdropOpacity.setValue(0)
    sheetTranslateY.setValue(windowHeight)
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [visible, backdropOpacity, sheetTranslateY, windowHeight])

  // 关闭：先反向播完（背板渐隐 + 内容区下滑）再真正 onClose 卸载 Modal
  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: windowHeight,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onClose())
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={handleClose}
      transparent
      visible={visible}
    >
      <View className="flex-1 justify-end">
        {/* 半透明背板：铺满全屏原地渐显，点击关闭 */}
        <Pressable onPress={handleClose} style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.4)', opacity: backdropOpacity },
            ]}
          />
        </Pressable>
        {/* 动画层：只负责从屏外上滑进入，不放任何 className 样式 */}
        <Animated.View style={{ transform: [{ translateY: sheetTranslateY }] }}>
          {/* 样式层：贴底、顶部大圆角、白底，底部 padding 避开 home 指示条 */}
          <View
            className="rounded-t-[26px] bg-white"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            {/* 头部：左 X 关闭 + 居中标题；右侧放一个同宽占位块保证标题真正居中 */}
            <View className="flex-row items-center px-4 pb-1 pt-4">
              <Pressable
                className="h-8 w-8 items-center justify-center"
                hitSlop={12}
                onPress={handleClose}
              >
                <FontAwesome6 color="#8191a6" name="xmark" size={18} />
              </Pressable>
              <Text className="flex-1 text-center text-lg font-black text-text-primary">
                {title}
              </Text>
              <View className="h-8 w-8" />
            </View>
            {children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}
