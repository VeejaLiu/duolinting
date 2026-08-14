import { FontAwesome6 } from '@expo/vector-icons'
import type { TranscriptLine } from '@duolinting/domain'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 跟读录音对比区块（仅 native 渲染，调用方负责按 Platform.OS 隐藏 web）。
 *
 * 口径说明：
 * - 录音文件按"句"隔离：文件名带 line.id，切换句子即丢弃上一句的临时文件，
 *   跟读定位是单句练习，不保留历史录音；
 * - 文件统一收纳到 cache 目录的 shadowing/ 子目录（cache 可被系统回收，
 *   录音本就是一次性练习素材，不进持久存储）；
 * - 播放对比只有"原句"（回放任一时刻的课程音频）和"我的录音"两个通道，
 *   互斥播放：点开始一个前先停掉另一个，避免两路声音叠在一起。
 */
export function ShadowingRecorder({
  line,
  onPause,
  onPlayLine,
}: {
  line: TranscriptLine
  /** 暂停课程音频（录音前必须调用，防止课程声音被录进去） */
  onPause: () => void
  /** 播放当前句原音（父层现成的整句回放逻辑） */
  onPlayLine: () => void
}) {
  const { t } = useLanguage()
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder)
  // 跟读录音的本地文件 uri；null 表示本句还没有录过
  const [recordingUri, setRecordingUri] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const recordingPlayer = useAudioPlayer(recordingUri)
  const recordingStatus = useAudioPlayerStatus(recordingPlayer)
  // ref 镜像 recordingUri，供 effect 清理阶段拿到最新值而不把它列进依赖
  const recordingUriRef = useRef<string | null>(null)
  recordingUriRef.current = recordingUri

  const discardRecordingFile = () => {
    const uri = recordingUriRef.current
    recordingUriRef.current = null
    setRecordingUri(null)
    if (uri) {
      // idempotent：文件已被系统清掉时静默忽略
      void FileSystem.deleteAsync(uri, { idempotent: true })
    }
  }

  // 切换句子：停掉进行中的录音与回放，丢弃上一句的临时文件和权限提示
  useEffect(() => {
    if (recorder.isRecording) {
      void recorder.stop()
    }
    recordingPlayer.pause()
    discardRecordingFile()
    setPermissionDenied(false)
    // 只响应切句；recorder/recordingPlayer 实例由 expo-audio 保证稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.id])

  // 组件卸载：归还录音态音频会话并清理临时文件
  useEffect(
    () => () => {
      void setAudioModeAsync({ allowsRecording: false })
      const uri = recordingUriRef.current
      if (uri) {
        void FileSystem.deleteAsync(uri, { idempotent: true })
      }
    },
    [],
  )

  const startRecording = async () => {
    // 先停课程音频和自己的回放，再请求权限、切换到可录音的音频会话
    onPause()
    recordingPlayer.pause()
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      setPermissionDenied(true)
      return
    }
    setPermissionDenied(false)
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    })
    await recorder.prepareToRecordAsync()
    recorder.record()
  }

  const stopRecording = async () => {
    await recorder.stop()
    // 录音结束立刻把会话切回纯播放，否则 iOS 上后续回放可能走听筒且音量异常
    await setAudioModeAsync({ allowsRecording: false })
    const sourceUri = recorder.uri
    if (!sourceUri) {
      return
    }

    const cacheDirectory = FileSystem.cacheDirectory
    if (!cacheDirectory) {
      // 极少数环境没有 cache 目录（如受限沙箱），退化为直接引用录音原始文件
      setRecordingUri(sourceUri)
      return
    }

    const directory = `${cacheDirectory}shadowing/`
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    const targetUri = `${directory}shadowing-${line.id}-${Date.now()}.m4a`
    await FileSystem.moveAsync({ from: sourceUri, to: targetUri })
    recordingUriRef.current = targetUri
    setRecordingUri(targetUri)
  }

  const handleToggleRecording = () => {
    if (recorderState.isRecording) {
      void stopRecording()
      return
    }
    void startRecording()
  }

  // 重录：丢弃旧文件后立刻重新开始一次录音
  const handleRerecord = () => {
    recordingPlayer.pause()
    discardRecordingFile()
    void startRecording()
  }

  const handlePlayOriginal = () => {
    recordingPlayer.pause()
    onPlayLine()
  }

  const handlePlayRecording = () => {
    if (!recordingUri) {
      return
    }
    if (recordingStatus.playing) {
      recordingPlayer.pause()
      return
    }
    // 播原句前先停掉，保证"原句 / 我的录音"两路互斥
    onPause()
    recordingPlayer.seekTo(0)
    recordingPlayer.play()
  }

  const isRecording = recorderState.isRecording

  return (
    <View>
      <View className="flex-row items-center gap-1.5">
        <FontAwesome6 color="#1cb0f6" name="microphone" size={12} />
        <Text className="text-xs font-black text-text-secondary">{t('study.shadowing')}</Text>
        {isRecording ? (
          <Text className="text-xs font-black text-danger">
            {t('shadowing.recording', { seconds: Math.floor(recorderState.currentTime) })}
          </Text>
        ) : null}
      </View>
      {permissionDenied ? (
        <Text className="mt-1.5 text-xs font-bold text-danger">
          {t('shadowing.permissionDenied')}
        </Text>
      ) : null}
      <View className="mt-2 flex-row gap-2">
        {recordingUri && !isRecording ? (
          <>
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] border-2 border-[#d7e4ef] border-b-[#c9d9e8] bg-surface-raised px-2"
              onPress={handlePlayOriginal}
              style={{ minHeight: 40, borderBottomWidth: 4 }}
            >
              <FontAwesome6 color="#1cb0f6" name="play" size={13} />
              <Text className="text-[12px] font-black text-text-primary">
                {t('shadowing.original')}
              </Text>
            </Pressable>
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] border-2 border-[#58cc02] border-b-[#46a302] bg-success px-2"
              onPress={handlePlayRecording}
              style={{ minHeight: 40, borderBottomWidth: 4 }}
            >
              <FontAwesome6
                color="#ffffff"
                name={recordingStatus.playing ? 'pause' : 'headphones'}
                size={13}
              />
              <Text className="text-[12px] font-black text-white">
                {recordingStatus.playing ? t('shadowing.pause') : t('shadowing.myRecording')}
              </Text>
            </Pressable>
            <Pressable
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] border-2 border-[#d7e4ef] border-b-[#c9d9e8] bg-surface-raised px-2"
              onPress={handleRerecord}
              style={{ minHeight: 40, borderBottomWidth: 4 }}
            >
              <FontAwesome6 color="#ff9600" name="rotate-right" size={13} />
              <Text className="text-[12px] font-black text-text-primary">
                {t('shadowing.rerecord')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-[16px] border-2 px-2 ${
              isRecording
                ? 'border-danger border-b-[#d63d3d] bg-danger'
                : 'border-[#d7e4ef] border-b-[#c9d9e8] bg-surface-raised'
            }`}
            onPress={handleToggleRecording}
            style={{ minHeight: 40, borderBottomWidth: 4 }}
          >
            <FontAwesome6
              color={isRecording ? '#ffffff' : '#1cb0f6'}
              name={isRecording ? 'stop' : 'microphone'}
              size={14}
            />
            <Text
              className={`text-[12px] font-black ${
                isRecording ? 'text-white' : 'text-text-primary'
              }`}
            >
              {isRecording ? t('shadowing.stop') : t('study.shadowing')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
