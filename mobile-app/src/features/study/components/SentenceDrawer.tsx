import { FontAwesome6 } from '@expo/vector-icons'
import type { ExerciseProgress, TranscriptLine } from '@duolinting/domain'
import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLanguage } from '@/i18n/LanguageProvider'

export function SentenceDrawer({
  lines,
  onClose,
  onSelectLine,
  progress,
  selectedLineId,
  title,
  visible,
}: {
  lines: TranscriptLine[]
  onClose: () => void
  onSelectLine: (line: TranscriptLine) => void
  progress: ExerciseProgress
  selectedLineId: string
  title: string
  visible: boolean
}) {
  // lines 沿用当前阶段的顺序（精听全部句子、复习全部难点句），
  // 掌握状态始终按 line.id 从课程进度读取，避免复习子集的序号错配状态。
  const { t } = useLanguage()
  const insets = useSafeAreaInsets()
  const { width, fontScale } = useWindowDimensions()
  const drawerWidth = Math.min(width * 0.88, 420)
  const animationProgress = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState(visible)
  const selectedIndex = Math.max(0, lines.findIndex((line) => line.id === selectedLineId))
  // 每项的高度包含底部 8pt 间距；随系统字号放大，保持长句两行和状态一行。
  // 明确布局后，虚拟列表可以直接定位当前句，无需先渲染前面的全部句子。
  const rowHeight = 100 * Math.max(1, fontScale) + 8

  useEffect(() => {
    if (visible) setMounted(true)
  }, [visible])

  useEffect(() => {
    if (!mounted) return

    // Modal 自带的 slide 从底部进入；沿用应用弹层的独立动画，背板原地
    // 渐显，只有列表从左侧滑入。退场结束才卸载，快速开关会取消旧动画。
    const animation = Animated.timing(animationProgress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    })
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false)
    })
    return () => animation.stop()
  }, [animationProgress, mounted, visible])

  if (!mounted) return null

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View className="flex-1" pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(23,32,51,0.35)', opacity: animationProgress },
            ]}
          />
        </Pressable>
        <Animated.View
          style={{
            flex: 1,
            width: drawerWidth,
            transform: [{
              translateX: animationProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [-drawerWidth, 0],
              }),
            }],
          }}
        >
          <View
            accessibilityViewIsModal
            className="flex-1 rounded-r-[26px] bg-[#f7fbff]"
            onAccessibilityEscape={onClose}
            style={{ paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left }}
          >
            <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
              <FontAwesome6 color="#1cb0f6" name="list-ul" size={18} />
              <Text accessibilityRole="header" className="flex-1 text-lg font-black text-text-primary">
                {title}
              </Text>
              <Pressable
                accessibilityLabel={t('common.close')}
                accessibilityRole="button"
                className="h-11 w-11 items-center justify-center rounded-[14px] bg-[#eaf4fc]"
                onPress={onClose}
              >
                <FontAwesome6 color="#3a5068" name="xmark" size={18} />
              </Pressable>
            </View>
            <FlatList
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              data={lines}
              extraData={{ progress, selectedLineId }}
              getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
              initialScrollIndex={selectedIndex}
              keyExtractor={(line) => line.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: line, index }) => {
                const mastered = Boolean(progress.lines[line.id]?.mastered)
                const selected = line.id === selectedLineId
                const status = t(mastered ? 'study.mastered' : 'study.notMastered')

                return (
                  <View style={{ height: rowHeight, paddingBottom: 8 }}>
                    <Pressable
                      accessibilityLabel={`${t('study.sentence', { count: index + 1 })}. ${line.text}. ${status}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`flex-1 flex-row items-center gap-3 rounded-[18px] border-2 px-3 py-3 ${
                        selected ? 'border-brand' : 'border-[#e4eef8] hover:border-[#1cb0f6]'
                      }`}
                      disabled={!visible}
                      onPress={() => {
                        onClose()
                        onSelectLine(line)
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: selected || pressed ? '#eaf7ff' : '#ffffff',
                      })}
                    >
                      <View className="min-h-9 min-w-9 items-center justify-center rounded-[12px] bg-[#edf7ff] px-1">
                        <Text className="text-sm font-black text-brand">{index + 1}</Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-bold leading-5 text-text-primary" numberOfLines={2}>
                          {line.text}
                        </Text>
                        <View className="mt-2 flex-row items-center gap-1.5">
                          <FontAwesome6
                            color={mastered ? '#58a700' : '#8191a6'}
                            name={mastered ? 'circle-check' : 'circle'}
                            size={13}
                          />
                          <Text
                            className="min-w-0 flex-1 text-xs font-bold"
                            numberOfLines={1}
                            style={{ color: mastered ? '#58a700' : '#8191a6' }}
                          >
                            {status}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  </View>
                )
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}
