import {
  Clipboard,
  ClipboardPaste,
  Download,
  Minus,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useRef } from 'react'
import type {
  SubtitleDraftAnalysis,
  SubtitleImportMode,
} from '../../lib/mediaDraftTools'

type SubtitleImporterProps = {
  subtitleDraft: string
  analysis: SubtitleDraftAnalysis
  importMode: SubtitleImportMode
  timeOffset: number
  onSubtitleDraftChange: (value: string) => void
  onImportModeChange: (value: SubtitleImportMode) => void
  onImportSubtitle: () => void
  onImportSubtitleFile: (file: File) => void
  onTimeOffsetChange: (offset: number) => void
  // 复制「专家分段提示词 + 当前英文字幕(SRT)」到剪切板，供粘贴到外部模型优化分段。
  onCopySegmentPrompt: () => void
  // 当前是否有可复制的英文字幕内容；无内容时禁用复制按钮。
  copySegmentPromptDisabled: boolean
  onDltjsonCopy: () => void
  onDltjsonExport: () => void
  onDltjsonImport: (file: File) => void
  onDltjsonPaste: () => void
  isModal?: boolean
}

export function SubtitleImporter({
  subtitleDraft,
  analysis,
  importMode,
  timeOffset,
  onSubtitleDraftChange,
  onImportModeChange,
  onImportSubtitle,
  onImportSubtitleFile,
  onTimeOffsetChange,
  onCopySegmentPrompt,
  copySegmentPromptDisabled,
  onDltjsonCopy,
  onDltjsonExport,
  onDltjsonImport,
  onDltjsonPaste,
  isModal = false,
}: SubtitleImporterProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dltjsonFileInputRef = useRef<HTMLInputElement | null>(null)

  const adjustOffset = (delta: number) => {
    onTimeOffsetChange(timeOffset + delta)
  }

  return (
    <details className="subtitle-import" open={isModal || undefined}>
      <summary>
        <span className="subtitle-import-title">字幕导入 / 导出</span>
        <span className="subtitle-import-formats">SRT · VTT · ASS · LRC · TXT</span>
      </summary>

      <div className="subtitle-import-body">
        <div className="subtitle-import-intro">
          <strong>导入字幕并生成逐句时间轴</strong>
          <span>支持字幕文件、文本粘贴和 dltjson，导入后仍可在波形上继续校准。</span>
        </div>
        <div className="subtitle-import-tools">
          <button
            className="command-button"
            disabled={copySegmentPromptDisabled}
            onClick={onCopySegmentPrompt}
            title="复制专家分段提示词 + 当前英文字幕（SRT 格式），可粘贴到 ChatGPT 等模型优化分段"
            type="button"
          >
            <Sparkles size={15} aria-hidden="true" />
            复制分段提示词
          </button>
          <input
            ref={fileInputRef}
            accept=".srt,.vtt,.ass,.lrc,.txt,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onImportSubtitleFile(file)
              }
              event.target.value = ''
            }}
            type="file"
          />
          <button
            className="command-button secondary"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload size={15} aria-hidden="true" />
            从文件导入
          </button>
        </div>

        <label className="field">
          <span>粘贴字幕文本</span>
          <textarea
            className="code-textarea"
            rows={8}
            value={subtitleDraft}
            onChange={(event) => onSubtitleDraftChange(event.target.value)}
            placeholder={'SRT: 00:00:01,000 --> 00:00:04,000\nFirst sentence.\n\nLRC: [00:01.00]First sentence.'}
          />
        </label>

        {analysis.isLikelyBilingual && (
          <div className="field">
            <span>检测到双语字幕</span>
            <div className="subtitle-bilingual-options">
              <label className="mini-radio">
                <input
                  checked={importMode === 'first-chinese'}
                  name="subtitle-import-mode"
                  onChange={() => onImportModeChange('first-chinese')}
                  type="radio"
                />
                <span>第一行是中文</span>
              </label>
              <label className="mini-radio">
                <input
                  checked={importMode === 'second-chinese'}
                  name="subtitle-import-mode"
                  onChange={() => onImportModeChange('second-chinese')}
                  type="radio"
                />
                <span>第二行是中文</span>
              </label>
            </div>
            <small>
              共检测到 {analysis.blockCount} 段，其中 {analysis.bilingualBlockCount}{' '}
              段符合双语两行结构。
            </small>
          </div>
        )}

        <div className="subtitle-import-footer">
          <div className="subtitle-offset">
            <span>时间偏移</span>
            <button
              className="mini-command"
              onClick={() => adjustOffset(-100)}
              title="减 100ms"
              type="button"
            >
              <Minus size={13} aria-hidden="true" />
            </button>
            <input
              className="offset-input"
              step="50"
              type="number"
              value={timeOffset}
              onChange={(event) =>
                // 输入非法（如清空后为 NaN）时回退为 0，避免后续偏移计算产生 NaN
                onTimeOffsetChange(Number(event.target.value) || 0)
              }
            />
            <small>ms</small>
            <button
              className="mini-command"
              onClick={() => adjustOffset(100)}
              title="加 100ms"
              type="button"
            >
              <Plus size={13} aria-hidden="true" />
            </button>
          </div>
          <button
            className="command-button"
            onClick={onImportSubtitle}
            type="button"
          >
            导入为逐句字幕
          </button>
        </div>

        <div className="subtitle-import-export">
          <div className="subtitle-import-section-title">
            <strong>dltjson</strong>
            <span>保存和迁移完整字幕编辑数据</span>
          </div>
          <div className="dltjson-actions">
            <button
              className="mini-command secondary"
              onClick={onDltjsonCopy}
              title="复制 dltjson 到剪切板，不支持时会打开手动复制面板"
              type="button"
            >
              <Clipboard size={14} aria-hidden="true" />
              复制 dltjson
            </button>
            <button
              className="mini-command secondary"
              onClick={onDltjsonPaste}
              title="打开 dltjson 粘贴输入框"
              type="button"
            >
              <ClipboardPaste size={14} aria-hidden="true" />
              粘贴 dltjson
            </button>
            <button
              className="mini-command"
              onClick={onDltjsonExport}
              title="导出为 dltjson 文件"
              type="button"
            >
              <Download size={14} aria-hidden="true" />
              导出 dltjson
            </button>
            <button
              className="mini-command secondary"
              onClick={() => dltjsonFileInputRef.current?.click()}
              type="button"
            >
              <Upload size={14} aria-hidden="true" />
              导入 dltjson
            </button>
            <input
              ref={dltjsonFileInputRef}
              accept=".dltjson,.htjson,.json"
              hidden
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  onDltjsonImport(file)
                  event.target.value = ''
                }
              }}
            />
          </div>
        </div>
      </div>
    </details>
  )
}
