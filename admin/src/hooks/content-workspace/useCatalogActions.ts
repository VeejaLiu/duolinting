import type {
  CatalogExerciseSummary,
  CreateCategoryGroupRequest,
  CreateCategoryRequest,
} from '@duolinting/shared'
import { useEffect, useState } from 'react'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import {
  createAdminOperationId,
  getAdminErrorDetails,
  logAdminError,
  logAdminInfo,
  logAdminWarn,
} from '../../lib/adminLogger'
import { apiClient } from '../../lib/apiClient'
import type { ContentAdminProps } from '../../components/admin/content-workspace/types'

const initialCategoryForm: CreateCategoryRequest = {
  groupId: 1,
  name: '新闻精听入门',
  description: '面向新闻材料的学习系列',
  accent: '#3a7ca5',
  coverImageUrl: '',
  sourceUrl: '',
  sortOrder: 10,
}

const initialCategoryGroupForm: CreateCategoryGroupRequest = {
  name: '新闻资讯',
  description: '新闻简报、专题报道、公共事件解读',
  accent: '#1cb0f6',
  coverImageUrl: '',
  sortOrder: 10,
}

const getNextSortOrder = (items: Array<{ sortOrder: number }>) =>
  items.reduce((maxOrder, item) => Math.max(maxOrder, item.sortOrder), 0) + 10

const normalizeSortOrder = <T extends { sortOrder: number }>(items: T[]) =>
  items.map((item, index) => ({
    ...item,
    sortOrder: (index + 1) * 10,
  }))

const moveItem = <T extends { id: number }>(
  items: T[],
  itemId: number,
  direction: 'up' | 'down',
) => {
  const nextItems = [...items]
  const currentIndex = nextItems.findIndex((item) => item.id === itemId)
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= nextItems.length
  ) {
    return null
  }

  const currentItem = nextItems[currentIndex]
  nextItems[currentIndex] = nextItems[targetIndex]
  nextItems[targetIndex] = currentItem
  return nextItems
}

type CatalogActionsOptions = Pick<ContentAdminProps, 'adminToken' | 'categoryGroups' | 'categories' | 'onRefreshCatalog' | 'onEnsureExercises' | 'onRequestConfirm'> & {
  localizedNotify: ContentAdminProps['onNotify']
}

export function useCatalogActions({
  adminToken,
  categoryGroups,
  categories,
  onRefreshCatalog,
  onEnsureExercises,
  onRequestConfirm,
  localizedNotify,
}: CatalogActionsOptions) {
  const { t } = useAdminLanguage()

  const [categoryForm, setCategoryForm] =
    useState<CreateCategoryRequest>(initialCategoryForm)
  const [categoryGroupForm, setCategoryGroupForm] =
    useState<CreateCategoryGroupRequest>(initialCategoryGroupForm)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (
      categoryGroups.length > 0 &&
      !categoryGroups.some((group) => group.id === categoryForm.groupId)
    ) {
      setCategoryForm((current) => ({
        ...current,
        groupId: categoryGroups[0].id,
      }))
    }
  }, [categoryForm.groupId, categoryGroups])

  const runAdminTask = async (
    task: () => Promise<void>,
    fallbackMessage: string,
  ): Promise<boolean> => {
    setIsSaving(true)
    try {
      await task()
      return true
    } catch (error) {
      localizedNotify(error instanceof Error ? error.message : fallbackMessage, 'error')
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const saveCategoryGroup = () =>
    runAdminTask(async () => {
      await apiClient.createCategoryGroup(
        {
          ...categoryGroupForm,
          sortOrder:
            categoryGroupForm.id !== undefined
              ? categoryGroupForm.sortOrder
              : getNextSortOrder(categoryGroups),
        },
        adminToken,
      )
      await onRefreshCatalog()
      localizedNotify('内容分类已保存', 'success')
    }, '内容分类保存失败')

  const saveCategory = () =>
    runAdminTask(async () => {
      if (!categoryForm.groupId) {
        throw new Error(t('请先创建内容分类'))
      }

      const siblingCategories = categories.filter(
        (category) => category.groupId === categoryForm.groupId,
      )
      await apiClient.createCategory(
        {
          ...categoryForm,
          sortOrder:
            categoryForm.id !== undefined
              ? categoryForm.sortOrder
              : getNextSortOrder(siblingCategories),
        },
        adminToken,
      )
      await onRefreshCatalog()
      localizedNotify('学习系列已保存', 'success')
    }, '学习系列保存失败')

  const deleteCategoryGroup = (groupId: number) =>
    void runAdminTask(async () => {
      await apiClient.deleteCategoryGroup(groupId, adminToken)
      await onRefreshCatalog()
      localizedNotify('内容分类已删除', 'success')
    }, '内容分类删除失败')

  const deleteCategory = (categoryId: number) =>
    void runAdminTask(async () => {
      await apiClient.deleteCategory(categoryId, adminToken)
      await onRefreshCatalog()
      localizedNotify('学习系列已删除', 'success')
    }, '学习系列删除失败')

  const moveCategoryGroup = (
    groupId: number,
    direction: 'up' | 'down',
  ) =>
    void runAdminTask(async () => {
      const movedGroups = moveItem(categoryGroups, groupId, direction)
      if (!movedGroups) {
        return
      }

      // 串行 upsert：中途失败时已保存的排序保持，避免并发写留下半套 sortOrder
      for (const group of normalizeSortOrder(movedGroups)) {
        await apiClient.createCategoryGroup(
          {
            id: group.id,
            name: group.name,
            description: group.description,
            accent: group.accent,
            coverImageUrl: group.coverImageUrl,
            sortOrder: group.sortOrder,
            localizations: group.localizations,
          },
          adminToken,
        )
      }
      await onRefreshCatalog()
      localizedNotify('内容分类顺序已更新', 'success')
    }, '内容分类排序失败')

  const moveCategory = (
    categoryId: number,
    direction: 'up' | 'down',
  ) =>
    void runAdminTask(async () => {
      const currentCategory = categories.find(
        (category) => category.id === categoryId,
      )
      if (!currentCategory) {
        return
      }

      const siblingCategories = categories.filter(
        (category) => category.groupId === currentCategory.groupId,
      )
      const movedCategories = moveItem(siblingCategories, categoryId, direction)
      if (!movedCategories) {
        return
      }

      // 串行 upsert：中途失败时已保存的排序保持，避免并发写留下半套 sortOrder
      for (const category of normalizeSortOrder(movedCategories)) {
        await apiClient.createCategory(
          {
            id: category.id,
            groupId: category.groupId,
            name: category.name,
            description: category.description,
            accent: category.accent,
            coverImageUrl: category.coverImageUrl,
            sourceUrl: category.sourceUrl,
            sortOrder: category.sortOrder,
            localizations: category.localizations,
          },
          adminToken,
        )
      }
      await onRefreshCatalog()
      localizedNotify('学习系列顺序已更新', 'success')
    }, '学习系列排序失败')

  const deleteCourse = async (exercise: CatalogExerciseSummary) => {
    const confirmed = await onRequestConfirm({
      title: t('删除课程'),
      message: t('删除课程“{{title}}”后，会同时删除课程元数据、字幕、学习进度和对应媒体文件。此操作不可撤销。', { title: exercise.title }),
      confirmLabel: t('确认删除'),
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }

    void runAdminTask(async () => {
      await apiClient.deleteExercise(exercise.id, adminToken)
      await onRefreshCatalog()
      localizedNotify(`课程已删除：${exercise.title}`, 'success')
    }, '课程删除失败')
  }

  const moveCourse = (
    exerciseId: number,
    direction: 'up' | 'down',
  ) => {
    const operationId = createAdminOperationId('course-sort')
    const operationStartedAt = Date.now()
    let outcome: 'pending' | 'saved' | 'not-found' | 'boundary' | 'failed' = 'pending'
    logAdminInfo('CourseSort', 'move-requested', {
      operationId,
      exerciseId,
      direction,
    })

    void runAdminTask(async () => {
      try {
        // 课程管理页使用分页数据展示，但排序需要知道整个系列的真实邻居。
        // 排序成功后目录刷新不会更新父层的全量 exercises 缓存，因此每次移动前都重新读取，
        // 否则连续下移会基于上一次操作前的顺序再次写入旧的交换结果。
        logAdminInfo('CourseSort', 'latest-exercises-fetch-start', { operationId })
        const availableExercises = await onEnsureExercises()
        logAdminInfo('CourseSort', 'latest-exercises-fetch-success', {
          operationId,
          totalExerciseCount: availableExercises.length,
        })
        const currentExercise = availableExercises.find((exercise) => exercise.id === exerciseId)
        if (!currentExercise) {
          outcome = 'not-found'
          logAdminWarn('CourseSort', 'move-skipped-exercise-not-found', {
            operationId,
            exerciseId,
            totalExerciseCount: availableExercises.length,
          })
          return
        }

        const siblingExercises = availableExercises
          .filter((exercise) => exercise.categoryId === currentExercise.categoryId)
          .sort((left, right) => left.sortOrder - right.sortOrder)
        const currentIndex = siblingExercises.findIndex((exercise) => exercise.id === exerciseId)
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
        if (currentIndex < 0) {
          outcome = 'not-found'
          logAdminWarn('CourseSort', 'move-skipped-current-not-in-siblings', {
            operationId,
            exerciseId,
            categoryId: currentExercise.categoryId,
            siblingCount: siblingExercises.length,
          })
          return
        }
        if (targetIndex < 0 || targetIndex >= siblingExercises.length) {
          outcome = 'boundary'
          logAdminWarn('CourseSort', 'move-skipped-boundary', {
            operationId,
            exerciseId,
            direction,
            categoryId: currentExercise.categoryId,
            currentIndex,
            targetIndex,
            siblingCount: siblingExercises.length,
          })
          return
        }

        // 只记录当前项附近的顺序，避免课程数量很大时把控制台刷满；
        // 这段信息足以判断连续移动时服务端返回的顺序是否已经变化。
        const siblingPreview = siblingExercises
          .slice(Math.max(0, currentIndex - 2), Math.min(siblingExercises.length, currentIndex + 3))
          .map((exercise) => ({
            id: exercise.id,
            title: exercise.title,
            sortOrder: exercise.sortOrder,
          }))
        logAdminInfo('CourseSort', 'neighbor-selected', {
          operationId,
          exerciseId,
          direction,
          categoryId: currentExercise.categoryId,
          currentIndex,
          targetIndex,
          siblingCount: siblingExercises.length,
          siblingPreview,
        })

        // 排序只交换相邻两门课的 sortOrder（2 次写），不整体重编号——
        // sortOrder 间距本来就是为了支撑局部交换。
        const current = siblingExercises[currentIndex]
        const neighbor = siblingExercises[targetIndex]
        const swapped: CatalogExerciseSummary[] = [
          { ...current, sortOrder: neighbor.sortOrder },
          { ...neighbor, sortOrder: current.sortOrder },
        ]

        // 历史遗留的重复排序值交换后顺序不变，此时才回退到全量重编号兜底
        const usesFullRenumber = current.sortOrder === neighbor.sortOrder
        const toPersist = usesFullRenumber
          ? normalizeSortOrder(moveItem(siblingExercises, exerciseId, direction) ?? [])
          : swapped
        logAdminInfo('CourseSort', 'persist-plan-created', {
          operationId,
          exerciseId,
          direction,
          strategy: usesFullRenumber ? 'full-renumber' : 'adjacent-swap',
          current: { id: current.id, sortOrder: current.sortOrder },
          neighbor: { id: neighbor.id, sortOrder: neighbor.sortOrder },
          persistCount: toPersist.length,
          persistItems: toPersist.slice(0, 50).map((exercise) => ({
            id: exercise.id,
            sortOrder: exercise.sortOrder,
          })),
          omittedPersistItemCount: Math.max(0, toPersist.length - 50),
        })

        // 串行 upsert：中途失败时已保存的排序保持，避免并发写留下半套 sortOrder
        for (const exercise of toPersist) {
          const previousSortOrder = siblingExercises.find((item) => item.id === exercise.id)?.sortOrder
          logAdminInfo('CourseSort', 'sort-save-start', {
            operationId,
            exerciseId: exercise.id,
            title: exercise.title,
            previousSortOrder,
            nextSortOrder: exercise.sortOrder,
          })
          await apiClient.createExercise(
            {
              id: exercise.id,
              categoryId: exercise.categoryId,
              title: exercise.title,
              source: exercise.source,
              sourceUrl: exercise.sourceUrl,
              difficulty: exercise.difficulty,
              durationLabel: exercise.durationLabel,
              mediaType: exercise.mediaType,
              audioUrl: exercise.audioUrl,
              coverImageUrl: exercise.coverImageUrl,
              summary: exercise.summary,
              sortOrder: exercise.sortOrder,
              // 透传原状态，避免把 archived 课程改回 published
              status: exercise.status,
            },
            adminToken,
          )
          logAdminInfo('CourseSort', 'sort-save-success', {
            operationId,
            exerciseId: exercise.id,
            nextSortOrder: exercise.sortOrder,
          })
        }

        logAdminInfo('CourseSort', 'catalog-refresh-start', { operationId })
        await onRefreshCatalog()
        logAdminInfo('CourseSort', 'catalog-refresh-success', { operationId })
        outcome = 'saved'
        localizedNotify('课程顺序已更新', 'success')
      } catch (error) {
        outcome = 'failed'
        logAdminError('CourseSort', 'move-failed', {
          operationId,
          exerciseId,
          direction,
          elapsedMs: Date.now() - operationStartedAt,
          ...getAdminErrorDetails(error),
        })
        throw error
      }
    }, '课程排序失败').then((succeeded) => {
      logAdminInfo('CourseSort', 'move-finished', {
        operationId,
        exerciseId,
        direction,
        outcome,
        taskSucceeded: succeeded,
        elapsedMs: Date.now() - operationStartedAt,
      })
    })
  }
  return {
    categoryForm,
    setCategoryForm,
    categoryGroupForm,
    setCategoryGroupForm,
    isSaving,
    runAdminTask,
    saveCategoryGroup,
    saveCategory,
    deleteCategoryGroup,
    deleteCategory,
    moveCategoryGroup,
    moveCategory,
    deleteCourse,
    moveCourse,
  }
}

