import { FontAwesome6 } from '@expo/vector-icons'
import type { ListeningExercise } from '@duolinting/domain'
import { Pressable, Text, View } from 'react-native'
import { VideoView, type VideoPlayer } from 'expo-video'
import { MediaProgressBar } from './MediaProgressBar'

export function ExtensiveStagePanel({
  currentTime,
  duration,
  exercise,
  formatClock,
  isPlaying,
  onSeek,
  onTogglePlayback,
  videoPlayer,
}: {
  currentTime: number
  duration: number
  exercise: ListeningExercise
  formatClock: (seconds: number) => string
  isPlaying: boolean
  onSeek: (seconds: number) => void
  onTogglePlayback: () => void
  videoPlayer: VideoPlayer
}) {
  return (
    <View>
      {exercise.mediaType === 'video' ? (
        <View className="bg-black">
          <VideoView
            contentFit="cover"
            // Safari 需要显式标记内联视频，否则一次播放手势会接管为系统全屏。
            fullscreenOptions={{ enable: false }}
            nativeControls={false}
            player={videoPlayer}
            playsInline
            style={{ width: '100%', height: 220 }}
          />
        </View>
      ) : (
        <View className="h-[220px] items-center justify-center bg-[#edf7ff] px-6">
          <View className="h-24 w-24 items-center justify-center rounded-[32px] bg-white">
            <FontAwesome6 color="#1cb0f6" name="headphones" size={38} />
          </View>
          <Text className="mt-4 text-center text-lg font-black text-text-primary">
            {exercise.title}
          </Text>
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
            onPress={onTogglePlayback}
            style={{
              shadowColor: '#46a302',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 1,
              shadowRadius: 0,
              elevation: 3,
            }}
          >
            <FontAwesome6
              color="#ffffff"
              name={isPlaying ? 'pause' : 'play'}
              size={18}
            />
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
