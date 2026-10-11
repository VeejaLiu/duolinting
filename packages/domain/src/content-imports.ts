/** Import tokens are separate from administrator sessions and read-only content API keys. */
export type AdminContentImportToken = {
  id: number
  name: string
  keyPrefix: string
  /** Includes future series when true; categoryIds is then empty. */
  allCategories: boolean
  categoryIds: number[]
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}
/** Omitting categoryIds or supplying [] defaults to all series, including future ones. */
export type CreateContentImportTokenRequest = {
  name: string
  categoryIds?: number[]
  /** Optional explicit override; false requires a nonempty categoryIds list. */
  allCategories?: boolean
  expiresAt?: string
}
export type CreateContentImportTokenResponse = { token: AdminContentImportToken; secret: string }
/** Byte sizes are exact; SHA-256 is optional, lowercase hex. SRT timestamps use seconds with milliseconds. */
export type ContentImportFile = {
  role: 'media' | 'subtitle' | 'cover'
  fileName: string
  contentType: string
  sizeBytes: number
  sha256?: string
  language?: 'en'
}
/** Creation-only metadata deliberately has no course ID, storage key, or publication status. */
export type CreateContentImportRequest = {
  categoryId: number
  sortOrder: number
  title: string
  summary?: string
  mediaType: 'audio' | 'video'
  language: 'en'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  sourceUrl: string
  source?: { provider: string; externalId: string }
  durationSeconds: number
  files: ContentImportFile[]
}
export type ContentImportStatus = 'awaiting_upload' | 'queued' | 'validating' | 'ready' | 'failed' | 'expired'
export type ContentImportResponse = {
  id: number
  status: ContentImportStatus
  expiresAt: string
  exerciseId: number | null
  /** The course is always created as draft; subsequent editorial actions belong to administrators. */
  createdAs: 'draft' | null
  adminPath: string | null
  validation: {
    media: { durationSeconds: number; audioCodec: string; videoCodec: string | null; width: number | null; height: number | null; sizeBytes: number }
    subtitle: { cueCount: number; encoding: 'UTF-8'; timelineChecked: boolean }
    warnings: string[]
  } | null
  error: { code: string; message: string; retryable: boolean } | null
  uploads?: { role: ContentImportFile['role']; method: 'PUT'; url: string; headers: Record<string, string>; expiresInSeconds: number }[]
}
