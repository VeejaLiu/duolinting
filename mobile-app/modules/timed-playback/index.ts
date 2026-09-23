import { requireOptionalNativeModule } from 'expo-modules-core'
export type NativePlaybackSnapshot = { positionUs: number; durationUs: number; playing: boolean; buffering: boolean; ended: boolean }
type TimedPlayback = {
  configure(player: unknown, id: string, startSeconds: number, endSeconds: number | null): Promise<NativePlaybackSnapshot>
  snapshot(id: string): NativePlaybackSnapshot | null
  clear(id: string): Promise<void>
  addListener(event: 'onRangeEnd', listener: (value: { id: string }) => void): { remove(): void }
}
export default requireOptionalNativeModule('TimedPlayback') as TimedPlayback | null
