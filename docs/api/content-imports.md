# 自动采集工具：仅草稿导入 API

## 1. 权限与开通

本接口只创建新的 `draft` 课程及其字幕，不能发布、修改或删除已有课程。草稿继续走后台校对、二次审核流程，学习端不会获得未发布课程。

超级管理员在后台「系统管理 → 开放内容 API」页面的「自动采集工具导入」区域创建凭据，不选系列默认允许全部系列（含以后新增系列），选择后只允许所选系列。全部系列动态包含以后新增的系列，仍然只能创建草稿；已有凭据保持原有范围，不自动升级权限。明文只展示一次。界面创建的凭据90天到期，可以撤销；API允许指定未来366天以内的到期时间。它与管理员登录凭据、开放内容读取 Key 相互独立。

管理接口（必须使用超级管理员会话）：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/admin/content-imports/tokens` | 列表，不返回明文或摘要 |
| POST | `/api/v1/admin/content-imports/tokens` | 创建；请求 `{ "name": "采集工具", "categoryIds": [123], "expiresAt": "2027-01-01T00:00:00Z" }`，到期时间可省略 |
| DELETE | `/api/v1/admin/content-imports/tokens/{id}` | 撤销；保留审计记录 |
| POST | `/api/v1/admin/content-imports/cleanup` | 手动触发过期临时文件清理；请求 `{}` |

指定系列凭据请求提供1–100个 `categoryIds`，`allCategories` 为 false 或省略。全部系列请求省略 `categoryIds` 或传入空数组，例如 `{ "name": "采集工具", "categoryIds": [] }`。也可显式传入 `allCategories: true`；不能同时提供全部权限和非空系列列表，显式 `allCategories: false` 时必须提供非空系列列表。凭据列表返回 `allCategories` 布尔值，全部系列时 `categoryIds` 为空。

采集工具所有请求携带 `Authorization: Bearer <导入凭据>`。禁止把凭据写入 URL、日志或仓库。导入凭据不能调用管理、审核、发布接口。撤销会阻止新请求及正在处理任务的最终建课；已经签发的对象存储 PUT 地址最长仍有效10分钟，但只能写临时对象，不能修改草稿文件。

## 2. 导入流程与接口

```text
查询授权目录
→ 创建任务（元数据＋文件清单＋Idempotency-Key）
→ 使用返回的PUT地址上传各文件
→ complete确认上传完成（202）
→ 轮询任务
→ ready：已创建草稿，进入后台人工校对和审核
```

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/content-imports/catalog` | 返回授权分类、系列ID；不自动创建目录 |
| POST | `/api/v1/content-imports` | 创建任务，或恢复同一幂等任务，返回上传地址 |
| POST | `/api/v1/content-imports/{id}/upload-urls` | 请求 `{}`；重新签发上传地址，保留已有文件 |
| POST | `/api/v1/content-imports/{id}/complete` | 请求 `{}`；进入后台处理，通常返回202；已完成任务返回200 |
| GET | `/api/v1/content-imports/{id}` | 查询本凭据创建的任务；不返回签名上传地址 |

目录沿用现有三层模型：内容分类 → 学习系列 → 课程。任务中的 `categoryId` 是学习系列ID，创建结果的 `exerciseId` 是课程ID，都是数据库自增整数。任务ID也是自增整数，没有另设内容编码。

## 3. 创建导入任务

请求头必须提供 `Idempotency-Key`（1–128个字符，仅字母、数字、点、下划线、冒号、连字符）。同一凭据、同一幂等键和同一规范化元数据返回原任务；换元数据返回409。

```json
{
  "categoryId": 123,
  "sortOrder": 1,
  "title": "Beginner Tennis Lesson: Forehand, Backhand & Serve",
  "summary": "",
  "mediaType": "video",
  "language": "en",
  "difficulty": "beginner",
  "sourceUrl": "https://www.youtube.com/watch?v=abcdefghijk",
  "source": { "provider": "youtube", "externalId": "abcdefghijk" },
  "durationSeconds": 1129,
  "files": [
    { "role": "media", "fileName": "tennis.mp4", "contentType": "video/mp4", "sizeBytes": 12345678 },
    { "role": "subtitle", "fileName": "tennis.srt", "contentType": "application/x-subrip", "sizeBytes": 34567, "language": "en" }
  ]
}
```

- `sortOrder` 是系列内的非负排序值，不是唯一标识。
- `durationSeconds` 是秒数，允许小数，范围大于0且不超过6小时；以服务端检测的实际时长为准。差异超过2秒与1%中的较大值时验收失败。
- `difficulty` 为 `beginner / intermediate / advanced`。
- 第一版只接受英文素材及英文原文 SRT：`language=en`。字幕不要求译文，后台可补译文。拒绝非UTF-8或混入其他未定义文件格式；不推测双语字幕的分行含义。
- `summary` 可省略；`source` 可省略。提供 `source` 时必须与URL检测结果完全一致：YouTube使用 `youtube` 和视频ID；其他来源使用 `url` 和规范化的完整URL。
- `role` 明确配对文件，同名前缀不参与匹配。每种role只能出现一次，媒体和字幕必需，封面可选。
- 可选 `sha256` 为64位小写十六进制，用于服务端对完整文件进行校验。
- 严格拒绝未定义字段，包括 `status`、`publish`、`id`、`exerciseId`、自定义对象键及媒体URL。

## 4. 文件上传

### 4.1 支持格式与大小


| role | 类型 | 上限 |
| --- | --- | --- |
| media/video | MP4：`video/mp4`，H.264 8-bit 4:2:0视频＋AAC音轨 | 512 MiB |
| media/audio | M4A：`audio/mp4`、`audio/m4a`、`audio/x-m4a`，AAC音轨 | 512 MiB |
| subtitle | `.srt`：`application/x-subrip` 或 `text/plain`，UTF-8 | 2 MiB |
| cover | JPEG/PNG/WebP，与声明MIME一致，最多4000万像素 | 10 MiB |

### 4.2 上传请求

响应中的 `uploads` 给出每个role的 `url`、`method=PUT`、必需 `headers` 和有效期。原样采用headers，上传完整文件的原始字节，不使用multipart表单，也不在PUT时携带导入凭据。

### 4.3 地址续期与重传

普通PUT失败可重传整个文件；第一版不支持分片断点续传。任务有效期24小时，签名地址最长10分钟。地址过期可请求 `upload-urls`；任务过期需更换幂等键创建新任务。

## 5. 状态、验收结果与错误

状态：`awaiting_upload → queued → validating → ready / failed`，过期任务为 `expired`。后台数据库队列每5秒检查一次，每个后端进程最多处理一个任务；崩溃后可在10分钟处理租约过期后恢复。

### 5.1 成功结果

成功结果示例：

```json
{
  "id": 456,
  "status": "ready",
  "expiresAt": "2026-10-12T00:00:00Z",
  "exerciseId": 789,
  "createdAs": "draft",
  "adminPath": "/importer/789",
  "validation": {
    "media": { "durationSeconds": 1129, "audioCodec": "aac", "videoCodec": "h264", "width": 1280, "height": 720, "sizeBytes": 12345678 },
    "subtitle": { "cueCount": 220, "encoding": "UTF-8", "timelineChecked": true },
    "warnings": ["HUMAN_SUBTITLE_REVIEW_REQUIRED"]
  },
  "error": null
}
```

`createdAs` 记录最初创建状态。之后管理员可通过正常审核发布，不改变导入记录。`adminPath` 相对后台站点，需要管理员登录，不是公开预览链接。

## 6. 验收与文件保护

文件会先从临时键复制到新的课程对象，再校验该副本。即使原上传URL仍有效，也不能覆盖已验收文件。课程、字幕、任务成功状态在同一数据库事务提交，重复 `complete` 或并发处理不会重复创建。

字幕校验包括：非空、有效时间戳、start小于end、开始时间顺序、结束不超过实际媒体时长（允许0.25秒容差）。不自动偏移或裁剪字幕。重叠字幕返回 `OVERLAPPING_CUES` 警告。时间校验不证明转写准确、口型同步或句子切分正确，始终需要人工审核。

## 7. 错误、重试与防重复

失败响应为 `{ "code": "...", "message": "...", "retryable": true/false }`；任务查询也在 `error` 返回同样结构。常见错误：

- 401：`IMPORT_TOKEN_REQUIRED / IMPORT_TOKEN_REVOKED`。
- 403：`CATEGORY_FORBIDDEN`。
- 404：`IMPORT_NOT_FOUND / CATEGORY_NOT_FOUND`，不能查询其他凭据的任务。
- 409：`IDEMPOTENCY_CONFLICT / SOURCE_ALREADY_EXISTS / SOURCE_ALREADY_IMPORTED / IMPORT_CONFLICT / IMPORT_BUSY`。
- 410：`IMPORT_EXPIRED`。
- 验收错误：`UPLOAD_INCOMPLETE / FILE_SIZE_MISMATCH / FILE_CHECKSUM_MISMATCH / FILE_CONTENT_TYPE_MISMATCH / INVALID_MEDIA / UNSUPPORTED_MEDIA_CODEC / DURATION_MISMATCH / SUBTITLE_* / INVALID_COVER`。
- 503：`MEDIA_PROBE_UNAVAILABLE / IMPORT_PROCESSING_FAILED`。

遇到网络或上传错误，用原任务和幂等键恢复；必要时重新签发URL并重传，再调用complete。若元数据本身错误，需要等待任务过期后更换幂等键重新创建；接口不修改已有任务元数据。不要因超时就立即换幂等键。

来源去重与幂等是两个机制：YouTube不同URL统一按视频ID去重；其他URL移除片段及常见跟踪参数并排序查询参数。导入来源全局唯一，已有手工课程也会检查其来源URL。失败任务在有效期内保留来源，过期可新建；成功任务永久保留来源记录，不自动覆盖或重新导入。

## 8. 运行与验证

Flyway迁移：`V202610110001__draft_content_imports.sql` 和 `V202610110002__content_import_all_series.sql`（全部系列范围）。应用代码不创建表；先通过项目既有Flyway流程迁移，再启动后端。后端运行环境必须安装 `ffprobe`；Dockerfile已包含ffmpeg。接口不在线转码。

后台每小时清理超过任务有效期加10分钟的临时对象和失败副本，保留成功课程文件及任务审计记录。后端必须拥有对象读取、写入、复制和删除权限；返回的预签名存储地址必须能从采集工具所在网络访问。普通PUT不强制存储端大小上限，完成时服务端按声明大小和硬上限拒绝不合规文件。

验证命令：

```bash
node --import tsx scripts/check-content-imports.mjs
node --import tsx scripts/check-content-imports.mjs --integration
```

集成检查只允许回环地址的MySQL和MinIO，创建独立临时数据库/存储桶，不写现有课程，结束时删除测试数据库、存储桶和系统临时文件。要求本地账号有临时数据库创建权限、本地现有表结构可用于克隆，以及ffmpeg/ffprobe可执行文件。
