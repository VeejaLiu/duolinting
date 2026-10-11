import TimedPlayback from '../../modules/timed-playback'
import { Platform } from 'react-native'
import type { AudioPlayer } from 'expo-audio'
import type { VideoPlayer } from 'expo-video'
import type { PlaybackAdapter } from '@duolinting/playback'
import { createWebPlaybackAdapter } from '@duolinting/playback/web'
import { createNativePlaybackAdapter } from './nativePlaybackAdapter'
export { isReleasedPlayerError } from './nativePlaybackAdapter'

export function createExpoPlaybackAdapter(
  audio: AudioPlayer, video: VideoPlayer, kind: 'audio' | 'video', getSource: () => string,
  recoverSource?: () => Promise<void>,
): PlaybackAdapter {
  const getWebMedia = () => {
    if (kind === 'audio') return (audio as unknown as { media?: HTMLMediaElement }).media ?? null
    const videos = Array.from((video as unknown as { _mountedVideos?: Set<HTMLMediaElement> })._mountedVideos ?? [])
    // Expo Web 的 VideoView 可能注册多个元素；只允许主元素出声。
    for (const element of videos) { element.onplay = null; element.onpause = null }
    for (const element of videos.slice(1)) element.pause()
    return videos[0] ?? null
  }
  if (Platform.OS === 'web') return createWebPlaybackAdapter(getWebMedia, getSource)

  return createNativePlaybackAdapter(audio, video, kind, getSource, TimedPlayback, recoverSource)
}
