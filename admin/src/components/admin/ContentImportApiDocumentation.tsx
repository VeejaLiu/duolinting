import { Alert, Table, Typography } from 'antd'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'
import type { AdminNoticeTone } from './AdminFeedback'
import { CodeExample } from './ApiDocumentationCodeExample'

type Props = { onNotify: (message: string, tone?: AdminNoticeTone) => void }
const payload = JSON.stringify({
  categoryId: 123, sortOrder: 1, title: 'Beginner Tennis Lesson: Forehand, Backhand & Serve', summary: '',
  mediaType: 'video', language: 'en', difficulty: 'beginner',
  sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
  source: { provider: 'youtube', externalId: 'abcdefghijk' }, durationSeconds: 1129,
  files: [
    { role: 'media', fileName: 'tennis.mp4', contentType: 'video/mp4', sizeBytes: 12345678 },
    { role: 'subtitle', fileName: 'tennis.srt', contentType: 'application/x-subrip', sizeBytes: 34567, language: 'en' },
  ],
}, null, 2)
const result = JSON.stringify({
  id: 456, status: 'ready', expiresAt: '2026-10-12T00:00:00Z', exerciseId: 789, createdAs: 'draft', adminPath: '/importer/789',
  validation: {
    media: { durationSeconds: 1129, audioCodec: 'aac', videoCodec: 'h264', width: 1280, height: 720, sizeBytes: 12345678 },
    subtitle: { cueCount: 220, encoding: 'UTF-8', timelineChecked: true }, warnings: ['HUMAN_SUBTITLE_REVIEW_REQUIRED'],
  }, error: null,
}, null, 2)

export function ContentImportApiDocumentation({ onNotify }: Props) {
  const { t } = useAdminLanguage()
  const code = (value: string) => <Typography.Text code>{value}</Typography.Text>
  const fieldColumns = [
    { title: t('字段'), dataIndex: 'field', render: code },
    { title: t('说明'), dataIndex: 'description' },
  ]
  const endpointColumns = [
    { title: t('方法'), dataIndex: 'method', width: 90, render: code },
    { title: t('路径'), dataIndex: 'path', render: code },
    { title: t('说明'), dataIndex: 'description' },
  ]
  const headers = '-H "Authorization: Bearer $DUOLINTING_IMPORT_TOKEN"'
  return <section id="draft-imports" className="open-content-api-documentation-section">
    <Typography.Title level={2}>3. {t('自动采集草稿导入')}</Typography.Title>
    <Alert showIcon type="info" message={t('仅可创建草稿，不能发布、覆盖或删除课程。')} description={t('校验通过后返回草稿课程 ID，继续由后台人工校对和二次审核发布。')} />

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.1 {t('开通导入凭据')}</Typography.Title>
      <Typography.Paragraph>{t('超级管理员在 API Key 管理页创建导入凭据，选择允许导入的学习系列。明文只展示一次，界面创建的凭据90天到期，可随时撤销。')}</Typography.Paragraph>
      <CodeExample code={[
        `export DUOLINTING_API_BASE="${window.location.origin}"`,
        'export DUOLINTING_IMPORT_TOKEN="dltimp_replace_with_the_token_shown_once"',
      ].join('\n')} language="shell" onNotify={onNotify} />
      <Typography.Paragraph>{t('留空默认全部系列（含以后新增系列）；选择后只允许所选系列。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('请求使用 Authorization: Bearer，不能使用开放内容读取 Key。凭据不能调用管理员接口，也不能查询其他凭据创建的任务。')}</Typography.Paragraph>
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.2 {t('导入流程与接口')}</Typography.Title>
      <Typography.Paragraph>{t('查询授权目录 → 创建任务 → PUT 上传文件 → complete 提交验收 → 轮询状态 → 获得草稿课程。')}</Typography.Paragraph>
      <Table className="open-content-api-request-table" columns={endpointColumns} pagination={false} rowKey="path" size="small" scroll={{ x: 780 }} dataSource={[
        { method: 'GET', path: '/api/v1/content-imports/catalog', description: t('查询授权分类和系列 ID；不自动创建目录。') },
        { method: 'POST', path: '/api/v1/content-imports', description: t('提交元数据和文件清单，创建或恢复幂等任务，返回上传地址。') },
        { method: 'POST', path: '/api/v1/content-imports/{id}/upload-urls', description: t('请求体为 {}；重新签发上传地址，保留已上传文件。') },
        { method: 'POST', path: '/api/v1/content-imports/{id}/complete', description: t('请求体为 {}；通常返回202并进入队列，已完成任务返回200。') },
        { method: 'GET', path: '/api/v1/content-imports/{id}', description: t('查询状态、验收结果和错误，不返回上传地址。') },
      ]} />
      <Typography.Paragraph>{t('目录为“内容分类 → 学习系列 → 课程”。categoryId 是系列 ID，exerciseId 是课程 ID，路径中的 id 是导入任务 ID，均为正整数。')}</Typography.Paragraph>
      <CodeExample code={`curl --fail --silent --show-error \\\n  ${headers} \\\n  "$DUOLINTING_API_BASE/api/v1/content-imports/catalog"`} language="shell" onNotify={onNotify} />
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.3 {t('创建导入任务')}</Typography.Title>
      <Typography.Paragraph>{t('将元数据保存为 import.json，再提交创建请求。示例 ID、文件大小和时长必须替换为实际值。')}</Typography.Paragraph>
      <CodeExample code={payload} language="json" onNotify={onNotify} />
      <CodeExample code={`curl --fail --silent --show-error \\\n  ${headers} \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: tennis-import-v1" \\\n  --data-binary @import.json \\\n  "$DUOLINTING_API_BASE/api/v1/content-imports"`} language="shell" onNotify={onNotify} />
      <Typography.Text className="open-content-response-label" strong>{t('创建任务响应（201 Created）')}</Typography.Text>
      <CodeExample code={JSON.stringify({
        id: 456, status: 'awaiting_upload', expiresAt: '2026-10-12T00:00:00Z', exerciseId: null, createdAs: null, adminPath: null, validation: null, error: null,
        uploads: [
          { role: 'media', method: 'PUT', url: 'https://storage.example.invalid/media-upload', headers: { 'Content-Type': 'video/mp4' }, expiresInSeconds: 600 },
          { role: 'subtitle', method: 'PUT', url: 'https://storage.example.invalid/subtitle-upload', headers: { 'Content-Type': 'application/x-subrip' }, expiresInSeconds: 600 },
        ],
      }, null, 2)} language="json" onNotify={onNotify} />
      <Typography.Title level={4}>{t('元数据字段')}</Typography.Title>
      <Table className="open-content-api-field-table" columns={fieldColumns} pagination={false} rowKey="field" size="small" scroll={{ x: 600 }} dataSource={[
        { field: 'Idempotency-Key', description: t('必填请求头：1–128个字符，仅字母、数字、点、下划线、冒号和连字符。') },
        { field: 'categoryId / sortOrder', description: t('必填：授权系列 ID，以及系列内的非负整数排序值。') },
        { field: 'title / summary', description: t('标题必填，最多180字符；简介可省略，最多10000字符。') },
        { field: 'mediaType / language / difficulty', description: t('必填：audio 或 video；当前素材语言仅支持 en；难度为 beginner、intermediate 或 advanced。') },
        { field: 'sourceUrl / source', description: t('HTTP(S) 来源地址必填；source 可省略。提供时必须与 URL 匹配：YouTube 用 youtube 和视频 ID，其他来源用 url 和规范化地址。') },
        { field: 'durationSeconds', description: t('必填：实际时长的秒数，可含小数，大于0且不超过6小时。') },
        { field: 'files[]', description: t('必填：media 和 subtitle 各一个，cover 可选。按 role 配对，不依赖同名文件。') },
        { field: 'files[].fileName / contentType / sizeBytes', description: t('必填：文件名、支持的 MIME 类型、准确的字节数。SRT 文件名必须以 .srt 结尾。') },
        { field: 'files[].sha256 / language', description: t('可选：SHA-256 为64位小写十六进制；文件 language 仅供字幕使用，值为 en。') },
      ]} />
      <Typography.Paragraph>{t('未定义字段会被拒绝，包括 status、publish、id、exerciseId、自定义对象键和媒体 URL。')}</Typography.Paragraph>
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.4 {t('上传文件与地址续期')}</Typography.Title>
      <Table className="open-content-api-field-table" columns={fieldColumns} pagination={false} rowKey="field" size="small" scroll={{ x: 600 }} dataSource={[
        { field: 'media · video', description: 'video/mp4 · H.264 8-bit 4:2:0 + AAC · ≤512 MiB' },
        { field: 'media · audio', description: 'audio/mp4 | audio/m4a | audio/x-m4a · AAC · ≤512 MiB' },
        { field: 'subtitle', description: '.srt · UTF-8 · application/x-subrip | text/plain · ≤2 MiB' },
        { field: 'cover', description: t('JPEG / PNG / WebP，MIME 必须匹配，最多4000万像素、10 MiB。') },
      ]} />
      <Typography.Paragraph>{t('创建响应中的 uploads 按 role 返回 url、method、headers 和 expiresInSeconds。按返回的 headers 上传完整原始字节，不使用 multipart，也不向存储地址发送导入凭据。')}</Typography.Paragraph>
      <CodeExample code={[
        'curl --fail --show-error --request PUT \\',
        '  -H "Content-Type: video/mp4" \\',
        '  --upload-file "./tennis.mp4" "$MEDIA_UPLOAD_URL"',
        '',
        'curl --fail --show-error --request PUT \\',
        '  -H "Content-Type: application/x-subrip" \\',
        '  --upload-file "./tennis.srt" "$SUBTITLE_UPLOAD_URL"',
      ].join('\n')} language="shell" onNotify={onNotify} />
      <Typography.Paragraph>{t('MEDIA_UPLOAD_URL 和 SUBTITLE_UPLOAD_URL 分别取自 media 和 subtitle 的返回地址；示例 Content-Type 也须与返回 headers 一致。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('任务有效期24小时，上传地址最长10分钟。地址过期可调用 upload-urls；上传失败可整文件重传，当前不支持分片断点续传。')}</Typography.Paragraph>
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.5 {t('提交验收与查询结果')}</Typography.Title>
      <CodeExample code={[
        'curl --fail --silent --show-error \\',
        `  ${headers} \\`,
        '  -H "Content-Type: application/json" --data \'{}\' \\',
        '  "$DUOLINTING_API_BASE/api/v1/content-imports/456/complete"',
        '',
        'curl --fail --silent --show-error \\',
        `  ${headers} \\`,
        '  "$DUOLINTING_API_BASE/api/v1/content-imports/456"',
      ].join('\n')} language="shell" onNotify={onNotify} />
      <Typography.Paragraph>{t('456 是示例任务 ID。complete 只排队，客户端断线不丢任务；建议每5秒查询一次，直到 ready、failed 或 expired。')}</Typography.Paragraph>
      <Typography.Text className="open-content-response-label" strong>{t('响应示例（200 OK）')}</Typography.Text>
      <CodeExample code={result} language="json" onNotify={onNotify} />
      <Typography.Paragraph>{t('ready 表示草稿已创建，不表示已发布。createdAs 记录初始草稿状态；adminPath 相对后台站点，需要管理员登录，不是公开预览链接。')}</Typography.Paragraph>
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.6 {t('状态、错误与重试')}</Typography.Title>
      <Table className="open-content-api-field-table" columns={fieldColumns} pagination={false} rowKey="field" size="small" scroll={{ x: 600 }} dataSource={[
        { field: 'awaiting_upload → queued → validating', description: t('等待上传 → 已排队 → 正在验收。') },
        { field: 'ready / failed / expired', description: t('草稿已创建 / 验收失败 / 任务过期。成功任务不会因上传有效期结束而失效。') },
        { field: '400 / 401 / 403 / 404', description: t('请求字段错误 / 凭据无效或撤销 / 系列未授权 / 任务或系列不存在。') },
        { field: '422', description: t('文件验收失败，读取任务 error 获取具体错误码。') },
        { field: '409 / 410 / 429 / 503', description: t('幂等或来源冲突、正在处理 / 任务过期 / 请求过多 / 存储或媒体检测暂不可用。') },
      ]} />
      <CodeExample code={JSON.stringify({ code: 'UPLOAD_INCOMPLETE', message: 'One or more uploaded files are missing', retryable: true }, null, 2)} language="json" onNotify={onNotify} />
      <Typography.Paragraph>{t('请求失败返回 code、message、retryable；后台验收错误也存入任务的 error。遇到网络或上传错误，用原任务重传并再次 complete，不要因超时更换幂等键。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('同一凭据和幂等键重复提交相同元数据会返回原任务，修改元数据返回409。任务元数据不可修改；需要修改时，等任务过期后使用新幂等键重新创建。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('常见验收错误包括文件缺失、大小或摘要不符、MIME 不符、媒体编码不支持、时长不符、字幕格式或时间轴错误、封面无效。根据 code 修正文件并检查 retryable。')}</Typography.Paragraph>
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.7 {t('验收标准与防重复')}</Typography.Title>
      <Typography.Paragraph>{t('以实际媒体时长为准；与申报值的差异超过2秒与1%中的较大值时失败。字幕必须为 UTF-8、非空、开始小于结束、开始时间有序，结束最多超出媒体0.25秒。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('不自动偏移或裁剪字幕。重叠句返回 OVERLAPPING_CUES；始终返回 HUMAN_SUBTITLE_REVIEW_REQUIRED，时间轴验收不能证明转写准确或口型同步。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('YouTube 按视频 ID 去重，其他 URL 移除片段及常见跟踪参数后去重。来源全局唯一，已有课程不能覆盖；失败任务在有效期内保留来源，过期可重建，成功任务永久保留。')}</Typography.Paragraph>
      <Typography.Paragraph>{t('已验收文件使用独立对象保存，旧上传地址不能替换它。重复提交和并发处理不会重复创建草稿。撤销凭据会阻止新请求及处理中的最终建课，已签发上传地址最多仍可写临时对象10分钟。')}</Typography.Paragraph>
    </section>

    <section className="open-content-api-documentation-section">
      <Typography.Title level={3}>3.8 {t('管理员凭据管理')}</Typography.Title>
      <Typography.Paragraph>{t('以下接口只接受超级管理员登录会话。列表不返回明文，创建只返回一次 secret；expiresAt 可省略，指定时须在未来366天以内。')}</Typography.Paragraph>
      <Table className="open-content-api-request-table" columns={endpointColumns} pagination={false} rowKey="pathKey" size="small" scroll={{ x: 780 }} dataSource={[
        { method: 'GET', path: '/api/v1/admin/content-imports/tokens', description: t('查询导入凭据列表。') },
        { method: 'POST', path: '/api/v1/admin/content-imports/tokens', description: t('创建凭据，指定名称、授权系列和可选到期时间。') },
        { method: 'DELETE', path: '/api/v1/admin/content-imports/tokens/{id}', description: t('撤销凭据并保留审计记录。') },
        { method: 'POST', path: '/api/v1/admin/content-imports/cleanup', description: t('请求体为 {}；清理过期临时文件，保留成功课程文件。') },
      ].map((item, index) => ({ ...item, pathKey: `${item.method}-${index}` }))} />
      <CodeExample code={JSON.stringify({ name: 'Collector', categoryIds: [123], expiresAt: '2027-01-01T00:00:00Z' }, null, 2)} language="json" onNotify={onNotify} />
      <Typography.Paragraph>{t('创建凭据时，categoryIds 省略或为空数组默认全部系列；提供1–100个系列 ID 则限制到这些系列。也可显式传入 allCategories，false 时必须提供非空系列列表。')}</Typography.Paragraph>
      <CodeExample code={JSON.stringify({ name: 'Collector', categoryIds: [] }, null, 2)} language="json" onNotify={onNotify} />
    </section>
  </section>
}
