import { FontAwesome6 } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { SafeScreen } from '@/components/primitives/SafeScreen'
import { AppScrollView } from '@/components/primitives/AppScrollView'
import { EmptyState } from '@/components/foundation/EmptyState'
import { useCatalogQuery } from '@/features/catalog/hooks'
import { StudyHeader } from '@/features/study/components/StudyHeader'
import { useStudyStore } from '@/stores/studyStore'
import { useLanguage } from '@/i18n/LanguageProvider'

/**
 * 生词列表页：把学习存档里所有章节的 vocabulary 按章节分组平铺。
 *
 * 口径说明：
 * - 数据源只有本地 studyStore（vocabulary 本身会随进度快照同步云端，
 *   列表页不需要再请求接口）；
 * - 章节标题/归属系列通过目录（useCatalogQuery）按 exerciseId 反查；
 *   查不到说明章节已下线或目录未加载，统一兜底显示"未知章节"，
 *   同时禁止点击跳转——没有 categoryId 组不出学习页路由；
 * - 分组按章节最近学习时间（progress.updatedAt）倒序，最近收的词排最前。
 */
export function VocabularyScreen() {
  const router = useRouter()
  const store = useStudyStore((state) => state.store)
  const { data: catalog } = useCatalogQuery()
  const { t } = useLanguage()

  const groups = Object.entries(store.progressByExercise)
    .map(([exerciseId, progress]) => {
      const summary = catalog?.exercises.find(
        (exercise) => exercise.id === Number(exerciseId),
      )
      const entries = Object.entries(progress.vocabulary ?? {})
      return {
        exerciseId: Number(exerciseId),
        categoryId: summary?.categoryId,
        title: summary?.title ?? t('vocabulary.unknownChapter'),
        updatedAt: progress.updatedAt,
        entries,
      }
    })
    .filter((group) => group.entries.length > 0)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  const totalWordCount = groups.reduce(
    (total, group) => total + group.entries.length,
    0,
  )

  return (
    <SafeScreen>
      <View className="flex-1 bg-[#f7fbff]">
        <StudyHeader title={t('vocabulary.title')} onBack={() => router.back()} />
        <AppScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}
        >
          {groups.length === 0 ? (
            <View className="mt-10">
              <EmptyState
                title={t('vocabulary.empty')}
                description={t('vocabulary.emptyDescription')}
              />
            </View>
          ) : (
            <>
              <Text className="text-sm font-black text-text-secondary">
                {t('vocabulary.summary', { words: totalWordCount, chapters: groups.length })}
              </Text>
              {groups.map((group) => (
                <View
                  key={group.exerciseId}
                  className="rounded-[22px] border-2 border-[#e4eef8] border-b-[6px] border-b-[#d7e4ef] bg-white px-4 py-4"
                >
                  <View className="flex-row items-center gap-2">
                    <FontAwesome6 color="#1cb0f6" name="book-open" size={14} />
                    <Text
                      className="flex-1 text-base font-black text-text-primary"
                      numberOfLines={1}
                    >
                      {group.title}
                    </Text>
                    <Text className="text-xs font-black text-text-muted">
                      {t('vocabulary.groupWords', { count: group.entries.length })}
                    </Text>
                  </View>
                  <View className="mt-3" style={{ gap: 8 }}>
                    {group.entries.map(([word, context]) => {
                      const canJump = group.categoryId !== undefined
                      return (
                        <Pressable
                          key={word}
                          className={`rounded-[16px] bg-[#f8fbff] px-3.5 py-3 ${
                            canJump ? '' : 'opacity-60'
                          }`}
                          disabled={!canJump}
                          onPress={() =>
                            router.push(
                              `/study/${group.categoryId}/${group.exerciseId}`,
                            )
                          }
                        >
                          <View className="flex-row items-center justify-between">
                            <Text className="text-base font-black text-text-primary">
                              {word}
                            </Text>
                            {canJump ? (
                              <FontAwesome6
                                color="#8191a6"
                                name="chevron-right"
                                size={11}
                              />
                            ) : null}
                          </View>
                          <Text
                            className="mt-1 text-sm font-bold text-text-secondary"
                            numberOfLines={2}
                          >
                            {context}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ))}
            </>
          )}
        </AppScrollView>
      </View>
    </SafeScreen>
  )
}
