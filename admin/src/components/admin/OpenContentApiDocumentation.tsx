import { Alert, Button, Divider, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeft, BookOpenText, Copy, Download, KeyRound } from 'lucide-react'
import type { AdminNoticeTone } from './AdminFeedback'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type OpenContentApiDocumentationProps = {
  onBack: () => void
  onNotify: (message: string, tone?: AdminNoticeTone) => void
}

type DltjsonField = {
  field: string
  description: string
}

type CodeExampleProps = {
  code: string
  language: string
  onNotify: OpenContentApiDocumentationProps['onNotify']
}

type ApiRequestHeader = {
  name: string
  required: string
  value: string
  description: string
}

type ApiRequestCardProps = {
  method: 'GET'
  path: string
  description: string
  headers: ApiRequestHeader[]
  pathParams?: Array<{ name: string; description: string; example: string }>
}

const copyText = async (
  value: string,
  onNotify: OpenContentApiDocumentationProps['onNotify'],
) => {
  try {
    await navigator.clipboard.writeText(value)
    onNotify('示例已复制', 'success')
  } catch {
    onNotify('复制失败，请手动复制', 'error')
  }
}

function CodeExample({ code, language, onNotify }: CodeExampleProps) {
  const { t } = useAdminLanguage()
  return (
    <div className="open-content-code-example">
      <div className="open-content-code-toolbar">
        <Tag>{language}</Tag>
        <Tooltip title={t('复制代码')}>
          <Button
            aria-label={t('复制代码')}
            icon={<Copy size={15} />}
            onClick={() => void copyText(code, onNotify)}
            size="small"
            type="text"
          />
        </Tooltip>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

const apiRequestHeaderColumns: ColumnsType<ApiRequestHeader> = [
  {
    dataIndex: 'name',
    key: 'name',
    title: '请求头',
    width: '24%',
    render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
  },
  {
    dataIndex: 'required',
    key: 'required',
    title: '必填',
    width: 64,
    render: (value: string) => <Tag color="red">{value}</Tag>,
  },
  {
    dataIndex: 'value',
    key: 'value',
    title: '值',
    width: '30%',
    render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
  },
  {
    dataIndex: 'description',
    key: 'description',
    title: '说明',
  },
]

function ApiRequestCard({ method, path, description, headers, pathParams }: ApiRequestCardProps) {
  const { t } = useAdminLanguage()
  return (
    <div className="open-content-api-request-card">
      <div className="open-content-api-request-title">
        <Space size={8}>
          <Tag color="blue">{method}</Tag>
          <Typography.Text code copyable>{path}</Typography.Text>
        </Space>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>

      {pathParams && pathParams.length > 0 && (
        <div className="open-content-api-request-block">
          <Typography.Text strong>{t('路径参数')}</Typography.Text>
          <Table
            className="open-content-api-request-table"
            columns={[
              { dataIndex: 'name', key: 'name', title: t('参数'), render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
              { dataIndex: 'example', key: 'example', title: t('示例值'), render: (value: string) => <Typography.Text code>{value}</Typography.Text> },
              { dataIndex: 'description', key: 'description', title: t('说明') },
            ]}
            dataSource={pathParams}
            pagination={false}
            rowKey="name"
            size="small"
          />
        </div>
      )}

      <div className="open-content-api-request-block">
        <Typography.Text strong>{t('请求头')}</Typography.Text>
        <Table
          className="open-content-api-request-table"
          columns={apiRequestHeaderColumns}
          dataSource={headers}
          pagination={false}
          rowKey="name"
          size="small"
        />
      </div>

      <div className="open-content-api-request-block">
        <Typography.Text strong>{t('请求体')}</Typography.Text>
        <div className="open-content-api-request-empty">
          <Typography.Text type="secondary">{t('无请求体')}</Typography.Text>
          <Typography.Text type="secondary">{t('这是 GET 请求，参数全部位于 URL 和请求头中。')}</Typography.Text>
        </div>
      </div>
    </div>
  )
}

const dltjsonFields: DltjsonField[] = [
  { field: 'version', description: '格式版本；当前固定为 "2.0"。' },
  { field: 'type', description: '文件类型；当前固定为 "dltjson"。' },
  { field: 'course', description: '课程元数据，包括标题、来源、难度、排序和本地化内容。' },
  { field: 'lines[].id', description: '句子的稳定标识。外部仓库更新内容时应保留该值。' },
  { field: 'lines[].start / end', description: '句子在原媒体时间轴上的起止秒数，均为 number。' },
  { field: 'lines[].text', description: '英文原句。' },
  { field: 'lines[].translation / translations', description: '兼容译文与按语言存放的多语言译文。' },
  { field: 'lines[].answers / keywords', description: '可接受答案与关键词数组。' },
]

const dltjsonColumns: ColumnsType<DltjsonField> = [
  {
    dataIndex: 'field',
    key: 'field',
    title: '字段',
    width: '34%',
    render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
  },
  {
    dataIndex: 'description',
    key: 'description',
    title: '说明',
  },
]

const apiKeyHeaders: ApiRequestHeader[] = [
  {
    name: 'X-DuolinTing-API-Key',
    required: '是',
    value: '$DUOLINTING_OPEN_CONTENT_API_KEY',
    description: '开放内容 API Key。请使用环境变量，不要把明文 Key 写进代码仓库。',
  },
]

const catalogExample = [
  '{',
  '  "version": "1.0",',
  '  "generatedAt": "2026-08-19T10:30:00.000Z",',
  '  "categoryGroups": [',
  '    { "id": 10, "name": "动画", "sortOrder": 10 }',
  '  ],',
  '  "categories": [',
  '    { "id": 21, "groupId": 10, "name": "小猪佩奇", "sortOrder": 10 }',
  '  ],',
  '  "courses": [',
  '    {',
  '      "id": 123,',
  '      "categoryId": 21,',
  '      "title": "Muddy Puddles",',
  '      "lineCount": 68,',
  '      "mediaType": "video",',
  '      "mediaUrl": "/api/v1/media/objects?key=video/2026/08/19/muddy-puddles.mp4",',
  '      "dltjsonUrl": "/api/v1/open-content/courses/123/dltjson"',
  '    }',
  '  ]',
  '}',
].join('\n')

const dltjsonExample = [
  '{',
  '  "version": "2.0",',
  '  "type": "dltjson",',
  '  "course": {',
  '    "id": 123,',
  '    "categoryId": 21,',
  '    "title": "Muddy Puddles",',
  '    "source": "Peppa Pig",',
  '    "difficulty": "beginner",',
  '    "durationLabel": "5:00",',
  '    "summary": "...",',
  '    "sortOrder": 10',
  '  },',
  '  "lines": [',
  '    {',
  '      "id": "line-001",',
  '      "start": 0.32,',
  '      "end": 2.48,',
  '      "text": "It is raining today.",',
  '      "translation": "今天在下雨。",',
  '      "translations": { "zh-CN": "今天在下雨。" },',
  '      "answers": ["It is raining today"],',
  '      "keywords": ["raining"]',
  '    }',
  '  ]',
  '}',
].join('\n')

const syncScript = [
  "import { mkdir, writeFile } from 'node:fs/promises'",
  "import { join, resolve } from 'node:path'",
  '',
  "const apiBase = process.env.DUOLINTING_API_BASE?.replace(/\\/+$/, '')",
  "const apiKey = process.env.DUOLINTING_OPEN_CONTENT_API_KEY",
  "const outputDirectory = resolve(process.env.DUOLINTING_OPEN_CONTENT_OUTPUT ?? './duolinting-content')",
  '',
  "if (!apiBase || !apiKey) {",
  "  throw new Error('Set DUOLINTING_API_BASE and DUOLINTING_OPEN_CONTENT_API_KEY first.')",
  '}',
  '',
  'const requestJson = async (path) => {',
  '  const response = await fetch(`${apiBase}${path}`, {',
  "    headers: { 'X-DuolinTing-API-Key': apiKey },",
  '  })',
  '  if (!response.ok) {',
  '    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`)',
  '  }',
  '  return response.json()',
  '}',
  '',
  '// Windows, macOS and Linux can all use these folder and file names.',
  'const safeName = (value) => {',
  '  const normalized = String(value ?? \'\')',
  "    .normalize('NFKC')",
  '    .replace(/[<>:"/\\\\|?*\\u0000-\\u001f]/g, \'-\')',
  "    .replace(/\\s+/g, ' ')",
  '    .trim()',
  "    .replace(/[. ]+$/g, '')",
  "  return normalized || 'untitled'",
  '}',
  '',
  "const sortToken = (value) => String(value ?? 0).padStart(4, '0')",
  '',
  "const catalog = await requestJson('/api/v1/open-content/catalog')",
  'const groupById = new Map(catalog.categoryGroups.map((group) => [group.id, group]))',
  'const categoryById = new Map(catalog.categories.map((category) => [category.id, category]))',
  '',
  'await mkdir(outputDirectory, { recursive: true })',
  "await writeFile(join(outputDirectory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\\n`)",
  '',
  'const courses = [...catalog.courses].sort((left, right) => {',
  '  const categoryOrder = left.categoryId - right.categoryId',
  '  return categoryOrder || left.sortOrder - right.sortOrder || left.id - right.id',
  '})',
  '',
  'for (const course of courses) {',
  '  const category = categoryById.get(course.categoryId)',
  '  const group = category && groupById.get(category.groupId)',
  '  if (!category || !group) {',
  '    console.warn(`Skip course ${course.id}: missing directory metadata.`)',
  '    continue',
  '  }',
  '',
  '  const directory = join(',
  '    outputDirectory,',
  '    `${sortToken(group.sortOrder)}-${safeName(group.name)}`,',
  '    `${sortToken(category.sortOrder)}-${safeName(category.name)}`,',
  '  )',
  '  const dltjson = await requestJson(course.dltjsonUrl)',
  '  const fileName = `${sortToken(course.sortOrder)}-${safeName(course.title)}.dltjson`',
  '  await mkdir(directory, { recursive: true })',
  '  await writeFile(join(directory, fileName), `${JSON.stringify(dltjson, null, 2)}\\n`)',
  '  console.log(`Saved ${join(directory, fileName)}`)',
  '}',
].join('\n')

export function OpenContentApiDocumentation({
  onBack,
  onNotify,
}: OpenContentApiDocumentationProps) {
  const { t } = useAdminLanguage()
  const apiOrigin = window.location.origin
  const environmentExample = [
    `export DUOLINTING_API_BASE="${apiOrigin}"`,
    'export DUOLINTING_OPEN_CONTENT_API_KEY="dltak_replace_with_the_key_shown_once"',
  ].join('\n')
  const catalogRequestExample = [
    'curl --fail --silent --show-error \\',
    '  -H "X-DuolinTing-API-Key: $DUOLINTING_OPEN_CONTENT_API_KEY" \\',
    '  "$DUOLINTING_API_BASE/api/v1/open-content/catalog"',
  ].join('\n')
  const courseDownloadExample = [
    'curl --fail --silent --show-error \\',
    '  -H "X-DuolinTing-API-Key: $DUOLINTING_OPEN_CONTENT_API_KEY" \\',
    '  "$DUOLINTING_API_BASE/api/v1/open-content/courses/123/dltjson" \\',
    '  --output "0001-Muddy Puddles.dltjson"',
  ].join('\n')

  const mediaDownloadExample = [
    'curl --fail --location --show-error \\',
    '  -H "X-DuolinTing-API-Key: $DUOLINTING_OPEN_CONTENT_API_KEY" \\',
    '  "$DUOLINTING_API_BASE/api/v1/media/objects?key=video/2026/08/19/muddy-puddles.mp4" \\',
    '  --output "source-muddy-puddles.mp4"',
  ].join('\n')

  return (
    <main className="open-content-api-documentation">
      <div className="open-content-api-documentation-header">
        <div>
          <Typography.Title level={2}>{t('开放内容 API 文档')}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {t('用独立 API Key 将已发布课程的目录、源媒体地址和字幕同步到本地工具或开源仓库。接口只提供已发布课程的媒体读取地址，不在服务器执行视频生成。')}
          </Typography.Paragraph>
        </div>
        <Button icon={<ArrowLeft size={16} />} onClick={onBack}>{t('返回 API Key')}</Button>
      </div>

      <Alert
        message={t('仅同步已发布课程')}
        description={t('目录中的课程都带有 dltjsonUrl。草稿、校对中、已归档或不存在的课程不会通过此接口导出。')}
        showIcon
        type="info"
      />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}><KeyRound size={18} />1. {t('配置访问凭据')}</Typography.Title>
        <Typography.Paragraph>
          {t('先在 API Key 管理页创建一个 Key 并立即保存明文。之后将它放入环境变量；不要将 Key 写进仓库、提交记录或浏览器前端代码。')}
        </Typography.Paragraph>
        <CodeExample code={environmentExample} language="shell" onNotify={onNotify} />
        <Typography.Paragraph type="secondary">
          {t('当前后台所在域名已预填为')} <Typography.Text code>{apiOrigin}</Typography.Text>。{t('外部同步仓库部署到其他环境时，只需改动 DUOLINTING_API_BASE。')}
        </Typography.Paragraph>
      </section>

      <Divider />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}><BookOpenText size={18} />2. {t('读取目录')}</Typography.Title>
        <Typography.Paragraph>
          {t('先请求目录，再依据')} <Typography.Text code>groupId</Typography.Text> {t('和')} <Typography.Text code>categoryId</Typography.Text> {t('组织“内容分类 / 学习系列 / 课程”三级目录。每门课程还会返回')} <Typography.Text code>mediaType</Typography.Text> {t('和')} <Typography.Text code>mediaUrl</Typography.Text>，{t('供本地生成器读取源媒体；字幕仍通过')} <Typography.Text code>dltjsonUrl</Typography.Text> {t('下载。')}
        </Typography.Paragraph>
        <ApiRequestCard
          description="返回所有已发布课程的目录、字幕下载地址和源媒体读取地址。"
          headers={apiKeyHeaders}
          method="GET"
          path="/api/v1/open-content/catalog"
        />
        <CodeExample code={catalogRequestExample} language="shell" onNotify={onNotify} />
        <Typography.Text className="open-content-response-label" strong>{t('响应示例（200 OK）')}</Typography.Text>
        <CodeExample code={catalogExample} language="json" onNotify={onNotify} />
      </section>

      <Divider />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}><Download size={18} />3. {t('下载单门课程')}</Typography.Title>
        <Typography.Paragraph>
          {t('把目录响应中的')} <Typography.Text code>dltjsonUrl</Typography.Text> {t('拼接到 API 域名后下载。下面的')} <Typography.Text code>123</Typography.Text> {t('仅为示例，请替换为目录返回的课程 ID。')}
        </Typography.Paragraph>
        <ApiRequestCard
          description="返回一门已发布课程的 dltjson 字幕文件。"
          headers={apiKeyHeaders}
          method="GET"
          path="/api/v1/open-content/courses/:courseId/dltjson"
          pathParams={[{ name: 'courseId', example: '123', description: '目录响应中的课程 ID，必须是正整数。' }]}
        />
        <CodeExample code={courseDownloadExample} language="shell" onNotify={onNotify} />
        <Typography.Text className="open-content-response-label" strong>{t('响应示例（200 OK）')}</Typography.Text>
        <CodeExample code={dltjsonExample} language="json" onNotify={onNotify} />
      </section>

      <Divider />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}><Download size={18} />4. {t('下载源媒体（本地生成器）')}</Typography.Title>
        <Typography.Paragraph>
          {t('目录中的')} <Typography.Text code>mediaUrl</Typography.Text> {t('是课程已经配置好的源媒体地址。只在本地视频生成任务需要时下载它；服务器只负责读取和传输对象，不参与解码或编码。媒体地址支持 Range 请求，下载工具可以安全地断点续传或利用 CDN 缓存。')}
        </Typography.Paragraph>
        <CodeExample code={mediaDownloadExample} language="shell" onNotify={onNotify} />
        <Typography.Paragraph type="secondary">
          <Typography.Text code>mediaType</Typography.Text> {t('为')} <Typography.Text code>audio</Typography.Text> {t('或')} <Typography.Text code>video</Typography.Text>。{t('推荐使用项目中的本地 CLI，它会自动读取这两个字段并把媒体缓存到本机。')}
        </Typography.Paragraph>
      </section>

      <Divider />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}>5. {t('完整同步脚本')}</Typography.Title>
        <Typography.Paragraph>
          {t('将下面代码保存为')} <Typography.Text code>sync-open-content.mjs</Typography.Text>，{t('使用 Node.js 22 或更高版本执行。它会保存目录快照，并将所有课程写入“内容分类 / 学习系列 / 课程.dltjson”。文件名会自动清理跨平台不支持的字符并保留排序号。')}
        </Typography.Paragraph>
        <CodeExample code={syncScript} language="node" onNotify={onNotify} />
        <CodeExample
          code="node sync-open-content.mjs"
          language="shell"
          onNotify={onNotify}
        />
      </section>

      <Divider />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}>6. {t('dltjson 格式')}</Typography.Title>
        <Typography.Paragraph>
          <Typography.Text code>start</Typography.Text> {t('与')} <Typography.Text code>end</Typography.Text> {t('的单位为秒，且应保持与原课程时间轴一致。同步脚本按原样保存每个文件，不会合成、重排或修改字幕。')}
        </Typography.Paragraph>
        <Table
          className="open-content-api-field-table"
          columns={dltjsonColumns}
          dataSource={dltjsonFields}
          pagination={false}
          rowKey="field"
          size="small"
        />
      </section>

      <Divider />

      <section className="open-content-api-documentation-section">
        <Typography.Title level={4}>7. {t('鉴权与错误处理')}</Typography.Title>
        <Space direction="vertical" size={8} style={{ display: 'flex' }}>
          <Typography.Text><Tag color="blue">请求头兼容</Tag> 新接入使用 <Typography.Text code>X-DuolinTing-API-Key</Typography.Text>；<Typography.Text code>X-API-Key</Typography.Text> 仅为兼容通用命令行工具保留。上面的请求卡片展示的是推荐写法。</Typography.Text>
          <Typography.Text><Tag color="red">401</Tag> 未提供、无效、已过期或已删除的 API Key。请由超级管理员检查 Key 的状态，必要时新建 Key 或调整到期时间。</Typography.Text>
          <Typography.Text><Tag color="orange">404</Tag> 课程不存在，或课程尚未发布，不能导出。</Typography.Text>
          <Typography.Text><Tag color="gold">400</Tag> 课程 ID 不是正整数。</Typography.Text>
          <Typography.Text type="secondary">目录和字幕接口使用 private, no-store 缓存策略；媒体对象沿用对象级长缓存。视频生成仍由本地任务完成，不会在服务器编码。</Typography.Text>
        </Space>
      </section>
    </main>
  )
}
