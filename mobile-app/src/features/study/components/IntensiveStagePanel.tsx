import { FontAwesome6 } from '@expo/vector-icons'
import type {
  ExerciseProgress,
  ListeningExercise,
  TranscriptLine,
} from '@duolinting/domain'
import { useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { VideoView, type VideoPlayer } from 'expo-video'
import { AcceptedAnswerFeedbackSheet } from '@/components/composites/AcceptedAnswerFeedbackSheet'
import { TranscriptLineRow } from '@/components/composites/TranscriptLineRow'
import { AppTextInput } from '@/components/primitives/AppTextInput'
import { ShadowingRecorder } from './ShadowingRecorder'
import { useLanguage } from '@/i18n/LanguageProvider'

const transcriptRowHeight = 72
const statusButtonNeutralBackground = '#f7fafd'
const statusButtonNeutralBorder = '#b8cfe4'
const statusButtonNeutralText = '#3a5068'
const unclearButtonActiveBackground = '#ffb300'
const masteredButtonActiveBackground = '#78ca3c'

// 精听练习工具（听写/笔记/跟读）暂时下线：产品决定现阶段不提供这些功能。
// 相关状态、回调与渲染代码全部保留，恢复时把开关改回 true 即可。
const SHOW_PRACTICE_TOOLS = false
// 收词入口（及配套生词功能）暂时下线，同样保留代码便于恢复。
const SHOW_VOCABULARY = false
// 底部「章节句子」列表暂时下线：精听聚焦当前句，列表恢复时改回 true 即可。
const SHOW_SENTENCE_LIST = false

export function IntensiveStagePanel({
  activeLineId,
  currentTime,
  dictationMatches,
  exercise,
  feedbackErrorMessage,
  feedbackSubmitted,
  formatClock,
  isPreparingPlayback,
  isPlaying,
  lineProgress,
  lines = exercise.lines,
  listTitle,
  onAddVocabulary,
  onCyclePlaybackRate,
  onDictationChange,
  onMarkLineMastered,
  onMarkLineUnclear,
  onMoveSelectedLine,
  onNoteChange,
  onPause,
  onPlayLine,
  onRevealLine,
  onSelectLine,
  onSubmitAcceptedAnswerFeedback,
  onToggleRevealLine,
  playbackRate,
  progress,
  revealedLineIds,
  selectedLine,
  selectedLineNumber,
  selectedLineIndex,
  videoPlayer,
}: {
  activeLineId: string | null
  currentTime: number
  /** 当前句听写是否命中 accepted answers（由父层用 isDictationAccepted 算好传入） */
  dictationMatches: boolean
  exercise: ListeningExercise
  feedbackErrorMessage?: string
  feedbackSubmitted: boolean
  formatClock: (seconds: number) => string
  isPreparingPlayback: boolean
  isPlaying: boolean
  lineProgress: ExerciseProgress['lines'][string]
  lines?: TranscriptLine[]
  listTitle?: string
  onAddVocabulary: (word: string) => void
  onCyclePlaybackRate: () => void
  onDictationChange: (lineId: string, text: string) => void
  onMarkLineMastered: (lineId: string) => void
  onMarkLineUnclear: (lineId: string) => void
  onMoveSelectedLine: (offset: number) => void
  onNoteChange: (lineId: string, note: string) => void
  onPause: () => void
  onPlayLine: () => void
  onRevealLine: (lineId: string) => void
  onSelectLine: (line: TranscriptLine) => void
  onSubmitAcceptedAnswerFeedback: (answer: string) => Promise<void>
  onToggleRevealLine: (lineId: string) => void
  playbackRate: number
  progress: ExerciseProgress
  revealedLineIds: Record<string, true>
  selectedLine: TranscriptLine
  selectedLineNumber?: number
  selectedLineIndex: number
  videoPlayer: VideoPlayer
}) {
  const { t } = useLanguage()
  const { height: viewportHeight } = useWindowDimensions()
  const listRef = useRef<ScrollView | null>(null)
  const listScrollYRef = useRef(0)
  const listHeightRef = useRef(0)
  const isVeryShortViewport = viewportHeight < 700
  const isShortViewport = viewportHeight < 780
  const panelGap = isVeryShortViewport ? 8 : 12
  const cardPadding = isVeryShortViewport ? 10 : isShortViewport ? 12 : 16
  const mediaTopMargin = isVeryShortViewport ? 8 : 16
  const controlTopMargin = isVeryShortViewport ? 7 : 12
  const secondaryControlTopMargin = isVeryShortViewport ? 5 : 8
  const primaryControlHeight = isVeryShortViewport ? 44 : isShortViewport ? 46 : 48
  const secondaryControlHeight = isVeryShortViewport ? 50 : 54
  const videoHeight = isVeryShortViewport ? 140 : isShortViewport ? 170 : 220
  const audioHeight = isVeryShortViewport ? 124 : isShortViewport ? 150 : 180
  const listPadding = isVeryShortViewport ? 8 : 12
  const minListHeight = isVeryShortViewport ? 170 : 210
  const displayLineNumber = selectedLineNumber ?? selectedLineIndex + 1
  const canMovePrevious = selectedLineIndex > 0
  const canMoveNext = selectedLineIndex < lines.length - 1
  const currentLineIsActive = activeLineId === selectedLine.id
  const currentLineIsPreparing = isPreparingPlayback && currentLineIsActive
  const currentLineIsPlaying = isPlaying && currentLineIsActive
  const canToggleCurrentLine = !currentLineIsPreparing
  const sentenceVisible = Boolean(revealedLineIds[selectedLine.id])

  // ===== 练习工具分段 =====
  // 听写 / 笔记 / 跟读任一时刻只渲染一段，把垂直空间还给下方的句子列表。
  // - 默认停在「听写」段（精听主流程）；
  // - 跟读依赖 expo-audio 录音，web 端不可用，web 上不出现该分段；
  // - 切句时【不】重置分段：用户在笔记/跟读中切换上句下句时保持当前工具，
  //   避免每次切句都被弹回听写段打断操作。
  const [activeTool, setActiveTool] = useState<
    'dictation' | 'note' | 'shadowing'
  >('dictation')
  const toolSegments = (
    [
      { key: 'dictation', label: t('study.dictation'), icon: 'pen-to-square' },
      { key: 'note', label: t('study.note'), icon: 'note-sticky' },
      { key: 'shadowing', label: t('study.shadowing'), icon: 'microphone' },
    ] as const
  ).filter((segment) => Platform.OS !== 'web' || segment.key !== 'shadowing')

  useEffect(() => {
    const targetY = Math.max(
      0,
      selectedLineIndex * transcriptRowHeight - transcriptRowHeight,
    )
    const currentY = listScrollYRef.current
    const listHeight = listHeightRef.current
    const selectedRowTop = selectedLineIndex * transcriptRowHeight
    const selectedRowBottom = selectedRowTop + transcriptRowHeight
    const rowAlreadyVisible =
      listHeight > 0 &&
      selectedRowTop >= currentY + transcriptRowHeight * 0.35 &&
      selectedRowBottom <= currentY + listHeight - transcriptRowHeight * 0.35

    if (rowAlreadyVisible) {
      return
    }

    listRef.current?.scrollTo({
      animated: false,
      y: targetY,
    })
  }, [selectedLineIndex])

  return (
    <View className="flex-1" style={{ gap: panelGap }}>
      <View
        className="rounded-[22px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white"
        style={{ padding: cardPadding }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-black text-brand">
            {t('study.sentenceNumber', { current: displayLineNumber, total: lines.length })}
          </Text>
          <View className="flex-row items-center gap-2">
            {/* 倍速胶囊：点击由父层在固定档位间循环，文本直接展示当前倍率 */}
            <Pressable
              className="flex-row items-center gap-1 rounded-pill border-2 border-[#d7e4ef] bg-surface-raised px-2.5 py-1"
              onPress={onCyclePlaybackRate}
            >
              <FontAwesome6 color="#1cb0f6" name="gauge-high" size={11} />
              <Text className="text-xs font-black text-text-primary">
                {playbackRate}x
              </Text>
            </Pressable>
            <Text className="text-xs font-bold text-text-secondary">
              {formatClock(currentTime)}
            </Text>
          </View>
        </View>
        {exercise.mediaType === 'video' ? (
          <View
            className="relative overflow-hidden rounded-[18px] bg-black"
            style={{ marginTop: mediaTopMargin }}
          >
            <VideoView
              contentFit="contain"
              // 精听依赖页面内的逐句与字幕控件，Safari 必须保持内联播放。
              fullscreenOptions={{ enable: false }}
              nativeControls={false}
              player={videoPlayer}
              playsInline
              style={{ width: '100%', height: videoHeight }}
            />
          </View>
        ) : (
          <View
            className="relative overflow-hidden rounded-[18px] bg-[#172033]"
            style={{ height: audioHeight, marginTop: mediaTopMargin }}
          >
            <View className="absolute left-4 top-4 rounded-pill bg-white/12 px-3 py-1">
              <Text className="text-xs font-black text-white">
                {t('study.sentence', { count: displayLineNumber })}
              </Text>
            </View>
            {sentenceVisible ? (
              <View className="absolute inset-x-4 bottom-4 rounded-[16px] bg-black/45 px-4 py-3">
                <Text
                  adjustsFontSizeToFit
                  className="text-center text-[24px] font-black leading-8 text-white"
                  minimumFontScale={0.75}
                  numberOfLines={4}
                >
                  {selectedLine.text}
                </Text>
                {selectedLine.translation ? (
                  <Text
                    adjustsFontSizeToFit
                    className="mt-2 text-center text-base font-bold leading-5 text-white/85"
                    minimumFontScale={0.82}
                    numberOfLines={2}
                  >
                    {selectedLine.translation}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View className="absolute inset-x-6 bottom-8">
                <Text className="text-center text-base font-black text-white/70">
                  {t('study.tapSubtitle')}
                </Text>
              </View>
            )}
          </View>
        )}
        <View className="flex-row gap-2" style={{ marginTop: controlTopMargin }}>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] bg-surface-raised px-1"
            disabled={!canMovePrevious}
            onPress={() => onMoveSelectedLine(-1)}
            style={{
              minHeight: primaryControlHeight,
              opacity: canMovePrevious ? 1 : 0.45,
            }}
          >
            <FontAwesome6 color="#172033" name="backward-step" size={17} />
            <Text className="text-[13px] font-black text-text-primary">
              {t('study.previous')}
            </Text>
          </Pressable>
          <Pressable
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] px-1 ${
              sentenceVisible ? 'bg-[#dff4ff]' : 'bg-surface-raised'
            }`}
            onPress={() => onToggleRevealLine(selectedLine.id)}
            style={{ minHeight: primaryControlHeight }}
          >
            <FontAwesome6 color="#1cb0f6" name="closed-captioning" size={17} />
            <Text className="text-[13px] font-black text-text-primary">
              {t('study.subtitle')}
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] bg-brand px-1"
            disabled={!canToggleCurrentLine}
            onPress={() => {
              if (currentLineIsPlaying) {
                onPause()
                return
              }

              onPlayLine()
            }}
            style={{
              minHeight: primaryControlHeight,
              opacity: canToggleCurrentLine ? 1 : 0.6,
            }}
          >
            <FontAwesome6
              color="#ffffff"
              name={currentLineIsPlaying ? 'pause' : 'play'}
              size={17}
            />
            <Text className="text-[13px] font-black text-white">{t('study.thisSentence')}</Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] bg-surface-raised px-1"
            disabled={!canMoveNext}
            onPress={() => onMoveSelectedLine(1)}
            style={{
              minHeight: primaryControlHeight,
              opacity: canMoveNext ? 1 : 0.45,
            }}
          >
            <FontAwesome6 color="#172033" name="forward-step" size={17} />
            <Text className="text-[13px] font-black text-text-primary">
              {t('study.next')}
            </Text>
          </Pressable>
        </View>
        <View className="flex-row gap-2" style={{ marginTop: secondaryControlTopMargin }}>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 px-3"
            onPress={() => onMarkLineUnclear(selectedLine.id)}
            style={{
              backgroundColor: lineProgress.unclear
                ? unclearButtonActiveBackground
                : statusButtonNeutralBackground,
              borderBottomLeftRadius: 999,
              borderColor: lineProgress.unclear
                ? unclearButtonActiveBackground
                : statusButtonNeutralBorder,
              borderTopLeftRadius: 999,
              borderWidth: 2,
              minHeight: secondaryControlHeight,
            }}
          >
            <FontAwesome6
              color={lineProgress.unclear ? '#ffffff' : statusButtonNeutralText}
              name="circle-question"
              size={17}
            />
            <Text
              className="text-center text-base font-black"
              style={{
                color: lineProgress.unclear
                  ? '#ffffff'
                  : statusButtonNeutralText,
              }}
            >
              {lineProgress.unclear ? t('study.markedDifficult') : t('study.markDifficult')}
            </Text>
          </Pressable>
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 px-3"
            onPress={() => {
              onRevealLine(selectedLine.id)
              onMarkLineMastered(selectedLine.id)
            }}
            style={{
              backgroundColor: lineProgress.mastered
                ? masteredButtonActiveBackground
                : statusButtonNeutralBackground,
              borderBottomRightRadius: 999,
              borderColor: lineProgress.mastered
                ? masteredButtonActiveBackground
                : statusButtonNeutralBorder,
              borderTopRightRadius: 999,
              borderWidth: 2,
              minHeight: secondaryControlHeight,
            }}
          >
            <FontAwesome6
              color={lineProgress.mastered ? '#ffffff' : statusButtonNeutralText}
              name="circle-check"
              size={17}
            />
            <Text
              className="text-center text-base font-black"
              style={{
                color: lineProgress.mastered
                  ? '#ffffff'
                  : statusButtonNeutralText,
              }}
            >
              {lineProgress.mastered ? t('study.mastered') : t('study.master')}
            </Text>
          </Pressable>
        </View>
        {exercise.mediaType === 'video' && sentenceVisible ? (
          // Safari 的内联播放器可用高度较小，字幕不覆盖视频且不截断内容。
          <View
            className="rounded-[16px] border-2 border-[#d7e4ef] bg-[#f8fbff] px-4 py-3"
            style={{ marginTop: secondaryControlTopMargin }}
          >
            <Text className="text-center text-[20px] font-black leading-7 text-text-primary">
              {selectedLine.text}
            </Text>
            {selectedLine.translation ? (
              <Text className="mt-2 text-center text-[15px] font-bold leading-5 text-text-secondary">
                {selectedLine.translation}
              </Text>
            ) : null}
          </View>
        ) : null}
        {/* 收词 chips：只在字幕已揭示时展示——口径是"先理解句子再收词"，
            原文还没看懂的阶段给收词入口只会变成无脑收集；已收的词置为绿色
            对勾态并禁用，重复收词由 addVocabulary 内部再兜一层去重 */}
        {SHOW_VOCABULARY && sentenceVisible && selectedLine.keywords.length > 0 ? (
          <View style={{ marginTop: secondaryControlTopMargin }}>
            <View className="mb-1.5 flex-row items-center gap-1.5">
              <FontAwesome6 color="#58cc02" name="bookmark" size={11} />
              <Text className="text-xs font-black text-text-secondary">
                {t('study.collectWords')}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {selectedLine.keywords.map((word) => {
                const collected = Boolean(progress.vocabulary[word])
                return (
                  <Pressable
                    key={word}
                    className={`flex-row items-center gap-1 rounded-pill border-2 border-b-[4px] px-3 py-1.5 ${
                      collected
                        ? 'border-success border-b-[#46a302] bg-[#ecffe4]'
                        : 'border-[#d7e2ee] border-b-[#d7e4ef] bg-white'
                    }`}
                    disabled={collected}
                    onPress={() => onAddVocabulary(word)}
                  >
                    <FontAwesome6
                      color={collected ? '#58cc02' : '#1cb0f6'}
                      name={collected ? 'check' : 'plus'}
                      size={10}
                    />
                    <Text
                      className={`text-xs font-black ${
                        collected ? 'text-success' : 'text-text-primary'
                      }`}
                    >
                      {word}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : null}
        {/* 练习工具分段控件：听写 / 笔记 / 跟读 三段切换，多邻国 chunky 风格，
            选中段蓝底白字；收词 chips 留在分段之外常显（轻量且与字幕揭示联动）。
            SHOW_PRACTICE_TOOLS=false 时整段（含下方三个工具面板）不渲染。 */}
        {SHOW_PRACTICE_TOOLS ? (
        <>
        <View
          className="flex-row gap-2"
          style={{ marginTop: secondaryControlTopMargin }}
        >
          {toolSegments.map((segment) => {
            const selected = activeTool === segment.key
            return (
              <Pressable
                key={segment.key}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-[14px] border-2 px-2 py-1.5 ${
                  selected
                    ? 'border-brand border-b-[#1899d6] bg-brand'
                    : 'border-[#d7e2ee] border-b-[#d7e4ef] bg-surface-raised'
                }`}
                onPress={() => setActiveTool(segment.key)}
              >
                <FontAwesome6
                  color={selected ? '#ffffff' : statusButtonNeutralText}
                  name={segment.icon}
                  size={13}
                />
                <Text
                  className={`text-xs font-black ${
                    selected ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {segment.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        {/* 听写段：字幕已揭示时不给输入框，避免照着原文抄写失去听写意义；
            此时若已有听写内容且判定未命中，改展示 accepted-answer 反馈入口 */}
        {activeTool === 'dictation' ? (sentenceVisible ? (
          !dictationMatches && lineProgress.dictation.trim() ? (
            <View style={{ marginTop: secondaryControlTopMargin }}>
              <AcceptedAnswerFeedbackSheet
                errorMessage={feedbackErrorMessage}
                initialAnswer={lineProgress.dictation}
                onSubmit={onSubmitAcceptedAnswerFeedback}
                submitted={feedbackSubmitted}
              />
            </View>
          ) : null
        ) : (
          <View style={{ marginTop: secondaryControlTopMargin }}>
            <AppTextInput
              multiline
              className="rounded-[16px] border-2 border-[#e4eef8] bg-[#f8fbff] px-3.5 py-2.5 text-sm font-bold text-text-primary"
              onChangeText={(text) => onDictationChange(selectedLine.id, text)}
              placeholder={t('study.dictationPlaceholder')}
              placeholderTextColor="#8ba3bd"
              value={lineProgress.dictation}
            />
            {/* 实时判定：有输入才提示，命中绿色、未命中橙色提醒可重听或揭晓字幕 */}
            {lineProgress.dictation.trim() ? (
              <Text
                className={`mt-1.5 text-xs font-black ${
                  dictationMatches ? 'text-success' : 'text-warning'
                }`}
              >
                {dictationMatches
                  ? t('study.dictationPerfect')
                  : t('study.dictationRetry')}
              </Text>
            ) : null}
          </View>
        )) : null}
        {/* 笔记段：自由文本，随时可记，与字幕是否揭示无关 */}
        {activeTool === 'note' ? (
        <View style={{ marginTop: secondaryControlTopMargin }}>
          <Text className="mb-1.5 text-xs font-black text-text-secondary">
            {t('study.note')}
          </Text>
          <AppTextInput
            multiline
            className="rounded-[16px] border-2 border-[#e4eef8] bg-[#f8fbff] px-3.5 py-2.5 text-sm font-bold text-text-primary"
            onChangeText={(text) => onNoteChange(selectedLine.id, text)}
            placeholder={t('study.notePlaceholder')}
            placeholderTextColor="#8ba3bd"
            value={lineProgress.note}
          />
        </View>
        ) : null}
        {/* 跟读段：expo-audio 录音在 web 端不可用，该分段在 web 上不出现；
            组件内部自管录音状态与临时文件（切句自动清理），父层只透传
            暂停/播放当前句两个回调 */}
        {activeTool === 'shadowing' && Platform.OS !== 'web' ? (
          <View style={{ marginTop: secondaryControlTopMargin }}>
            <ShadowingRecorder
              line={selectedLine}
              onPause={onPause}
              onPlayLine={onPlayLine}
            />
          </View>
        ) : null}
        </>
        ) : null}
      </View>

      {SHOW_SENTENCE_LIST ? (
      <View
        className="min-h-0 flex-1 rounded-[22px] border-2 border-[#e4eef8] bg-[#f8fbff]"
        style={{ minHeight: minListHeight, padding: listPadding }}
      >
        <View className="mb-2 flex-row items-center justify-between px-1">
          <View className="flex-row items-center gap-2">
            <FontAwesome6 color="#1cb0f6" name="list-check" size={15} />
            <Text className="text-sm font-black text-text-primary">
              {listTitle ?? t('study.chapterSentences')}
            </Text>
          </View>
          <Text className="text-xs font-black text-text-secondary">
            {displayLineNumber}/{lines.length}
          </Text>
        </View>
        <ScrollView
          ref={listRef}
          className="min-h-0 flex-1"
          contentContainerStyle={{ gap: 8, paddingBottom: 6 }}
          indicatorStyle="black"
          nestedScrollEnabled
          onLayout={(event) => {
            listHeightRef.current = event.nativeEvent.layout.height
          }}
          onScroll={(event) => {
            listScrollYRef.current = event.nativeEvent.contentOffset.y
          }}
          scrollEventThrottle={32}
          persistentScrollbar
          showsVerticalScrollIndicator
        >
          {lines.map((line, index) => {
            const currentLineProgress = progress.lines[line.id]
            return (
              <TranscriptLineRow
                compact
                key={line.id}
                line={line}
                mastered={Boolean(currentLineProgress?.mastered)}
                onPress={() => onSelectLine(line)}
                revealed={Boolean(revealedLineIds[line.id]) || Boolean(currentLineProgress?.mastered)}
                selected={line.id === selectedLine.id}
                unclear={Boolean(currentLineProgress?.unclear)}
                visibleIndex={index + 1}
              />
            )
          })}
        </ScrollView>
      </View>
      ) : null}
    </View>
  )
}
