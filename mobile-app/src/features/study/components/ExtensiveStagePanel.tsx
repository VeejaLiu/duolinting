import { FontAwesome6 } from '@expo/vector-icons'
import type { ListeningExercise } from '@duolinting/domain'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { VideoView, type VideoPlayer } from 'expo-video'
import { MediaProgressBar } from './MediaProgressBar'
import { MediaLoadingOverlay } from './MediaLoadingOverlay'

export function ExtensiveStagePanel({
  currentTime,
  duration,
  exercise,
  formatClock,
  isMediaLoading,
  isPreparingPlayback,
  isPlaying,
  onSeek,
  onTogglePlayback,
  videoAspectRatio,
  videoPlayer,
}: {
  currentTime: number
  duration: number
  exercise: ListeningExercise
  formatClock: (seconds: number) => string
  isMediaLoading: boolean
  isPreparingPlayback: boolean
  isPlaying: boolean
  onSeek: (seconds: number) => void
  onTogglePlayback: () => void
  videoAspectRatio: number
  videoPlayer: VideoPlayer
}) {
  const showPlaybackLoading = isMediaLoading || isPreparingPlayback

  return (
    <View>
      {exercise.mediaType === 'video' ? (
        <View className="relative items-center overflow-hidden bg-black">
          <VideoView
            contentFit="contain"
            // Safari 需要显式标记内联视频，否则一次播放手势会接管为系统全屏。
            fullscreenOptions={{ enable: false }}
            nativeControls={false}
            player={videoPlayer}
            playsInline
            // Android 的 SurfaceView 可能盖住 React Native 兄弟视图；TextureView
            // 确保 loading 浮层始终显示在视频画面之上。
            surfaceType="textureView"
            // 用源视频轨道的宽高比驱动容器，竖屏视频不再被固定横屏高度裁切。
            style={{ width: '100%', aspectRatio: videoAspectRatio }}
          />
          {showPlaybackLoading && <MediaLoadingOverlay />}
        </View>
      ) : (
        <View className="relative h-[220px] items-center justify-center bg-[#edf7ff] px-6">
          <View className="h-24 w-24 items-center justify-center rounded-[32px] bg-white">
            <FontAwesome6 color="#1cb0f6" name="headphones" size={38} />
          </View>
          {exercise.waveform && <View style={{ width: '100%', height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {Array.from({ length: 80 }, (_, i) => {
              const peaks = exercise.waveform!.peaks; let peak = 0
              for (let j = Math.floor(i*peaks.length/80); j < Math.floor((i+1)*peaks.length/80); j++) peak = Math.max(peak, peaks[j])
              return <View key={i} style={{ width: 2, height: Math.max(1,peak*40), backgroundColor: '#1cb0f6' }} />
            })}
          </View>}
          <Text className="mt-4 text-center text-lg font-black text-text-primary">
            {exercise.title}
          </Text>
          {showPlaybackLoading && <MediaLoadingOverlay />}
        </View>
      )}

      <View
        className="rounded-b-[14px] bg-[#172033] px-4 pb-4 pt-3"
        style={{
          shadowColor: '#172033',
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.14,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            className="h-12 w-12 items-center justify-center rounded-[16px] bg-success"
            disabled={isPreparingPlayback}
            onPress={onTogglePlayback}
            style={{
              shadowColor: '#46a302',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 1,
              shadowRadius: 0,
              elevation: 3,
              opacity: isPreparingPlayback ? 0.72 : 1,
            }}
          >
            {showPlaybackLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <FontAwesome6
                color="#ffffff"
                name={isPlaying ? 'pause' : 'play'}
                size={18}
              />
            )}
          </Pressable>
          <MediaProgressBar
            currentTime={currentTime}
            duration={duration}
            onSeek={onSeek}
          />
          <Text className="min-w-[78px] text-right text-xs font-black text-white/85">
            {formatClock(currentTime)} / {formatClock(duration)}
          </Text>
        </View>
      </View>
    </View>
  )
}
