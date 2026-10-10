import type { AdminExercisePage } from '@duolinting/shared'

// 仅内存缓存最近十页、有效期一分钟；账号变化时全部清空，避免跨账号复用。
let ownerToken = ''
const pages = new Map<string, { data: AdminExercisePage; savedAt: number }>()
export function clearCourseListCache() { pages.clear(); ownerToken = '' }
export function readCourseListCache(token: string, key: string) {
  if (ownerToken !== token) { pages.clear(); ownerToken = token }
  const entry = pages.get(key)
  return entry && Date.now() - entry.savedAt < 60_000 ? entry.data : undefined
}
export function writeCourseListCache(token: string, key: string, data: AdminExercisePage) {
  if (ownerToken !== token) { pages.clear(); ownerToken = token }
  pages.delete(key)
  pages.set(key, { data, savedAt: Date.now() })
  if (pages.size > 10) pages.delete(pages.keys().next().value!)
}
