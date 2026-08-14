import { useRef, useState } from 'react'
import {
  PanResponder,
  View,
  type LayoutChangeEvent,
} from 'react-native'

export function MediaProgressBar({
  currentTime,
  duration,
  onSeek,
}: {
  currentTime: number
  duration: number
  onSeek: (seconds: number) => void
}) {
  const [trackWidth, setTrackWidth] = useState(0)
  const dragStartRatioRef = useRef(0)
  const progressPercent =
    duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0
  const progressStateRef = useRef({ duration, progressPercent, trackWidth })
  progressStateRef.current = { duration, progressPercent, trackWidth }

  const seekFromRatio = (ratio: number) => {
    const currentState = progressStateRef.current
    if (currentState.trackWidth <= 0 || currentState.duration <= 0) {
      return
    }

    const clampedRatio = Math.min(Math.max(ratio, 0), 1)
    onSeek(clampedRatio * currentState.duration)
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const currentState = progressStateRef.current
        const ratio =
          currentState.trackWidth > 0
            ? event.nativeEvent.locationX / currentState.trackWidth
            : currentState.progressPercent
        dragStartRatioRef.current = Math.min(Math.max(ratio, 0), 1)
        seekFromRatio(dragStartRatioRef.current)
      },
      onPanResponderMove: (_event, gestureState) => {
        const currentState = progressStateRef.current
        if (currentState.trackWidth <= 0) {
          return
        }

        seekFromRatio(
          dragStartRatioRef.current + gestureState.dx / currentState.trackWidth,
        )
      },
    }),
  ).current

  return (
    <View
      {...panResponder.panHandlers}
      className="h-8 flex-1 justify-center"
      onLayout={(event: LayoutChangeEvent) => {
        setTrackWidth(event.nativeEvent.layout.width)
      }}
    >
      <View className="h-2 overflow-hidden rounded-pill bg-white/25">
        <View
          className="h-full rounded-pill bg-white/80"
          style={{ width: `${progressPercent * 100}%` }}
        />
      </View>
      <View
        className="absolute h-4 w-4 rounded-full bg-white"
        style={{
          left: `${progressPercent * 100}%`,
          marginLeft: -8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.28,
          shadowRadius: 5,
          elevation: 3,
        }}
      />
    </View>
  )
}
