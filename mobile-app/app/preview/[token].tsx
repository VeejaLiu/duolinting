import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { VideoView } from 'expo-video'
import type { ListeningExercise } from '@duolinting/domain'
import { transcriptTranslation, supportsCoursePlayback } from '@duolinting/domain'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { useAuthStore } from '@/stores/authStore'
import { useLanguage } from '@/i18n/LanguageProvider'
import { useExercisePlayback } from '@/hooks/useExercisePlayback'
import { apiClient } from '@/lib/apiClient'

export default function ReleasePreviewScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const router = useRouter(), { t, contentLocale } = useLanguage()
  const authToken = useAuthStore((state) => state.authToken)
  const [course, setCourse] = useState<ListeningExercise>(), [index, setIndex] = useState(0), [rate, setRate] = useState(1)
  const [repeats, setRepeats] = useState(1)
  const [completed, setCompleted] = useState<string | null>(null), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('')
  const attempt = useRef(0)
  const evidence = useRef<{ startedPositionUs: number; finishedPositionUs: number } | null>(null)
  const playback = useExercisePlayback({ exercise: course, playbackRate: rate })
  useEffect(() => {
    let active = true
    setCourse(undefined); setError(''); setCompleted(null); setConfirmed(false)
    if (!authToken) return
    void apiClient.getCoursePreview(token, authToken, contentLocale).then((value) => {
      if (!supportsCoursePlayback(value)) throw new Error(t('preview.updateRequired'))
      if (active) { setCourse(value); setIndex(0) }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : t('study.loadFailed')) })
    return () => { active = false }
  }, [token, authToken, contentLocale, t])
  const line = course?.lines[index]
  const play = async () => {
    if (!line) return
    const id = ++attempt.current; setCompleted(null); setConfirmed(false); setError('')
    const session = playback.playRangeSession(line, repeats)
    const started = await session.started, result = await session.finished
    if (attempt.current !== id) return
    if (result.reason === 'range-ended') {
      evidence.current = { startedPositionUs: started.positionUs, finishedPositionUs: result.positionUs }; setCompleted(line.id)
    } else if (result.reason === 'failed' || result.reason === 'timeout') setError(t(playback.nativePlaybackAvailable ? 'study.playbackFailed' : 'preview.updateRequired'))
  }
  const confirm = async () => {
    if (!line || !evidence.current || completed !== line.id || !authToken || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return
    try {
      await apiClient.confirmCoursePreview(token, authToken, { platform: Platform.OS, lineId: line.id,
        startUs: Math.round(line.start * 1e6), endUs: Math.round(line.end * 1e6), ...evidence.current, playbackRate: rate, adapter: 'native-timed-v1', playbackContractVersion: 1 })
      setConfirmed(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('study.playbackFailed')) }
  }
  const button = (label: string, action: () => void, disabled = false) => <Pressable disabled={disabled} onPress={action} accessibilityRole="button" style={{ padding: 12, borderRadius: 8, backgroundColor: disabled ? '#e2e8f0' : '#1cb0f6', marginVertical: 4 }}><Text>{label}</Text></Pressable>
  return <SafeScreen><AppScrollView contentContainerStyle={{ padding: 16 }}>
    {button(t('preview.back'), () => { playback.pause(); router.back() })}
    <Text style={{ fontSize: 20, fontWeight: '700' }}>{t('preview.title')}</Text>
    {!authToken && <Text>{t('preview.loginRequired')}</Text>}
    {error && <Text accessibilityRole="alert">{error}</Text>}
    {playback.playbackError && <Text>{t(playback.nativePlaybackAvailable ? 'study.playbackFailed' : 'preview.updateRequired')}</Text>}
    {course && line && <>
      <Text>{course.title} · {course.release?.courseReleaseId}</Text>
      {course.mediaType === 'video' && <VideoView player={playback.videoPlayer} nativeControls={false} style={{ height: 220, width: '100%' }} />}
      {course.waveform && <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {Array.from({ length: 80 }, (_, i) => {
          const peaks = course.waveform!.peaks; let peak = 0
          for (let j = Math.floor(i*peaks.length/80); j < Math.floor((i+1)*peaks.length/80); j++) peak = Math.max(peak, peaks[j])
          return <View key={i} style={{ width: 2, height: Math.max(1,peak*60), backgroundColor: '#1cb0f6' }} />
        })}
      </View>}
      <Text style={{ fontSize: 19, marginTop: 16 }}>{line.text}</Text><Text>{transcriptTranslation(line, contentLocale)}</Text>
      <Text>{line.start.toFixed(3)} → {line.end.toFixed(3)}</Text>
      {button(t('preview.play'), () => void play(), playback.isPreparingPlayback)}
      {button(t('preview.stop'), playback.pause)}
      {button(`${t('preview.repeat')} ${repeats}`, () => { attempt.current++; playback.pause(); setCompleted(null); setConfirmed(false); setRepeats(repeats === 3 ? 1 : repeats + 1) })}
      {button(t('preview.rate')+` ${rate}×`, () => { attempt.current++; playback.pause(); setCompleted(null); setConfirmed(false); setRate(rate === 2 ? 0.5 : rate + 0.5) })}
      {button(t('preview.previous'), () => { attempt.current++; playback.pause(); setCompleted(null); setConfirmed(false); setIndex(index-1) }, index===0)}
      {button(t('preview.next'), () => { attempt.current++; playback.pause(); setCompleted(null); setConfirmed(false); setIndex(index+1) }, index===course.lines.length-1)}
      {button(t(confirmed ? 'preview.confirmed' : 'preview.confirm'), () => void confirm(), completed !== line.id || confirmed || Platform.OS === 'web')}
    </>}
  </AppScrollView></SafeScreen>
}
