import {
  Clipboard,
  ClipboardPaste,
  Download,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useRef } from 'react'
import type {
  SubtitleDraftAnalysis,
  SubtitleImportMode,
} from '../../lib/mediaDraftTools'
import { useAdminLanguage } from '../../i18n/AdminLanguageProvider'

type SubtitleImporterProps = {
  subtitleDraft: string
  analysis: SubtitleDraftAnalysis
  importMode: SubtitleImportMode
  onSubtitleDraftChange: (value: string) => void
  onImportModeChange: (value: SubtitleImportMode) => void
  onImportSubtitle: () => void
  onImportSubtitleFile: (file: File) => void
  // 复制通用 AI 翻译提示词和完整 dltjson，处理结果可通过 dltjson 粘贴入口导回。
  onCopyAiTranslation: () => void
  copyAiTranslationDisabled: boolean
  onDltjsonCopy: () => void
  onDltjsonImportFile: (file: File) => void
  onDltjsonExport: () => void
  onDltjsonPaste: () => void
  isModal?: boolean
}

export function SubtitleImporter({
  subtitleDraft,
  analysis,
  importMode,
  onSubtitleDraftChange,
  onImportModeChange,
  onImportSubtitle,
  onImportSubtitleFile,
  onCopyAiTranslation,
  copyAiTranslationDisabled,
  onDltjsonCopy,
  onDltjsonImportFile,
  onDltjsonExport,
  onDltjsonPaste,
  isModal = false,
}: SubtitleImporterProps) {
  const { t } = useAdminLanguage()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dltjsonFileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <details className="subtitle-import" open={isModal || undefined}>
      <summary>
        <span className="subtitle-import-title">{t('字幕导入 / 导出')}</span>
        <span className="subtitle-import-formats">SRT · VTT · ASS · LRC · TXT</span>
      </summary>

      <div className="subtitle-import-body">
        <section className="subtitle-import-module subtitle-import-module--import">
          <div className="subtitle-import-section-title">
            <strong>{t('导入字幕并生成逐句时间轴')}</strong>
            <span>{t('导入后仍可在波形上继续校准。')}</span>
          </div>
          <div className="subtitle-import-tools">
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
              {t('从文件导入')}
            </button>
          </div>
          <small className="subtitle-import-file-hint">
            {t('支持的字幕文件格式：SRT、VTT、ASS、LRC、TXT')}
          </small>

          <label className="field">
            <span>{t('粘贴字幕文本')}</span>
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
              <span>{t('检测到双语字幕')}</span>
              <div className="subtitle-bilingual-options">
                <label className="mini-radio">
                  <input
                    checked={importMode === 'first-chinese'}
                    name="subtitle-import-mode"
                    onChange={() => onImportModeChange('first-chinese')}
                    type="radio"
                  />
                  <span>{t('第一行是中文')}</span>
                </label>
                <label className="mini-radio">
                  <input
                    checked={importMode === 'second-chinese'}
                    name="subtitle-import-mode"
                    onChange={() => onImportModeChange('second-chinese')}
                    type="radio"
                  />
                  <span>{t('第二行是中文')}</span>
                </label>
              </div>
              <small>
                {t('共检测到 {{blocks}} 段，其中 {{bilingual}} 段符合双语两行结构。', { blocks: analysis.blockCount, bilingual: analysis.bilingualBlockCount })}
              </small>
            </div>
          )}

          <button
            className="command-button"
            onClick={onImportSubtitle}
            type="button"
          >
            {t('导入为逐句字幕')}
          </button>
        </section>

        <section className="subtitle-import-module subtitle-import-module--dltjson">
          <div className="subtitle-import-section-title">
            <strong>{t('dltjson 文件')}</strong>
            <span>{t('通过文件或剪贴板管理 dltjson')}</span>
          </div>
          <div className="dltjson-action-group">
            <span className="dltjson-action-group-title">{t('导入 / 导出')}</span>
            <div className="dltjson-actions">
              <input
                ref={dltjsonFileInputRef}
                accept=".dltjson,.json,application/json,text/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    onDltjsonImportFile(file)
                  }
                  event.target.value = ''
                }}
                type="file"
              />
              <button
                className="mini-command secondary"
                onClick={() => dltjsonFileInputRef.current?.click()}
                title={t('导入 dltjson 文件')}
                type="button"
              >
                <Upload size={14} aria-hidden="true" />
                {t('导入 dltjson')}
              </button>
              <button
                className="mini-command"
                onClick={onDltjsonExport}
                title={t('导出为 dltjson 文件')}
                type="button"
              >
                <Download size={14} aria-hidden="true" />
                {t('导出 dltjson')}
              </button>
            </div>
          </div>
          <div className="dltjson-action-group">
            <span className="dltjson-action-group-title">{t('复制 / 粘贴')}</span>
            <div className="dltjson-actions">
              <button
                className="mini-command secondary"
                onClick={onDltjsonCopy}
                title={t('复制 dltjson 到剪切板，不支持时会打开手动复制面板')}
                type="button"
              >
                <Clipboard size={14} aria-hidden="true" />
                {t('复制 dltjson')}
              </button>
              <button
                className="mini-command secondary"
                onClick={onDltjsonPaste}
                title={t('打开 dltjson 粘贴输入框')}
                type="button"
              >
                <ClipboardPaste size={14} aria-hidden="true" />
                {t('粘贴 dltjson')}
              </button>
            </div>
          </div>
        </section>

        <section className="subtitle-import-module subtitle-import-module--ai-translation">
          <div className="subtitle-import-section-title">
            <strong>{t('AI 翻译任务')}</strong>
            <span>{t('复制提示词给任意翻译 AI，完成后粘贴结果。')}</span>
          </div>
          <button
            className="mini-command ai-action-button"
            disabled={copyAiTranslationDisabled}
            onClick={onCopyAiTranslation}
            title={t('复制提示词和完整 dltjson，可交给任意 AI 服务翻译')}
            type="button"
          >
            <Sparkles size={14} aria-hidden="true" />
            {t('复制 AI 翻译提示词')}
          </button>
        </section>
      </div>
    </details>
  )
}
