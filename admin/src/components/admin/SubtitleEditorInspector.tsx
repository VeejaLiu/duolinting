import { Button, Input, InputNumber } from 'antd'
import { Languages, ListPlus } from 'lucide-react'
import { useState } from 'react'
import {
  cleanEnglishAnswerText,
  cleanSubtitleSpacing,
  TRANSLATION_LOCALE_LABELS,
  TRANSLATION_TARGET_LOCALES,
  type DraftLine,
} from '../../lib/mediaDraftTools'
import type { ContentLocale } from '@duolinting/domain'
import { SubtitleList } from './SubtitleList'

type SubtitleEditorInspectorProps = {
  activeLineIndex: number
  draftLines: DraftLine[]
  onActiveLineChange: (index: number) => void
  onUpdateLine: (index: number, patch: Partial<DraftLine>) => void
  onTranslateSingle?: (text: string) => Promise<Partial<Record<ContentLocale, string>>>
}

const millisecondsToSeconds = (milliseconds: number) => Math.round(milliseconds) / 1000
type SubtitleInspectorTab = 'list' | 'detail'

export function SubtitleEditorInspector({
  activeLineIndex,
  draftLines,
  onActiveLineChange,
  onUpdateLine,
  onTranslateSingle,
}: SubtitleEditorInspectorProps) {
  const [isTranslatingSingle, setIsTranslatingSingle] = useState(false)
  const [activeTab, setActiveTab] = useState<SubtitleInspectorTab>('list')
  const activeLine = draftLines[activeLineIndex]

  return (
    <aside className="subtitle-editor-inspector" aria-label="字幕详细编辑">
      <div className="subtitle-inspector-tablist" role="tablist" aria-label="字幕编辑视图">
        <button
          aria-controls="subtitle-list-panel"
          aria-selected={activeTab === 'list'}
          className={activeTab === 'list'
            ? 'subtitle-inspector-tab active'
            : 'subtitle-inspector-tab'}
          id="subtitle-list-tab"
          onClick={() => setActiveTab('list')}
          role="tab"
          type="button"
        >
          字幕列表（{draftLines.length}）
        </button>
        <button
          aria-controls="subtitle-detail-panel"
          aria-selected={activeTab === 'detail'}
          className={activeTab === 'detail'
            ? 'subtitle-inspector-tab active'
            : 'subtitle-inspector-tab'}
          id="subtitle-detail-tab"
          onClick={() => setActiveTab('detail')}
          role="tab"
          type="button"
        >
          当前字幕详情
        </button>
      </div>
      <div
        aria-labelledby={activeTab === 'list' ? 'subtitle-list-tab' : 'subtitle-detail-tab'}
        className="subtitle-inspector-tab-content"
        id={activeTab === 'list' ? 'subtitle-list-panel' : 'subtitle-detail-panel'}
        role="tabpanel"
      >
        {activeTab === 'list' ? (
          <SubtitleList
            activeLineIndex={activeLineIndex}
            draftLines={draftLines}
            embedded
            onActiveLineChange={(index) => {
              onActiveLineChange(index)
              setActiveTab('detail')
            }}
          />
        ) : activeLine ? (
          <div className="subtitle-detail-tab">
          <div className="subtitle-time-fields" aria-label="字幕时间范围（毫秒）">
            <InputNumber
              aria-label="字幕开始时间（毫秒）"
              className="subtitle-time-input"
              controls={false}
              min={0}
              precision={0}
              size="small"
              value={Math.round(activeLine.start * 1000)}
              onChange={(value) =>
                onUpdateLine(activeLineIndex, {
                  start: millisecondsToSeconds(value ?? 0),
                })
              }
            />
            <span className="subtitle-time-separator" aria-hidden="true">→</span>
            <InputNumber
              aria-label="字幕结束时间（毫秒）"
              className="subtitle-time-input"
              controls={false}
              min={0}
              precision={0}
              size="small"
              value={Math.round(activeLine.end * 1000)}
              onChange={(value) =>
                onUpdateLine(activeLineIndex, {
                  end: millisecondsToSeconds(value ?? 0),
                })
              }
            />
            <small className="subtitle-time-unit">ms</small>
          </div>
          <div className="subtitle-text-grid">
            <label className="field wide">
              <span>英文字幕</span>
              <Input
                size="small"
                value={activeLine.text}
                onChange={(event) => onUpdateLine(activeLineIndex, { text: event.target.value })}
                onBlur={(event) => onUpdateLine(activeLineIndex, { text: cleanEnglishAnswerText(event.target.value) })}
              />
            </label>
            <div className="field wide">
              <div className="translation-field-head">
                <span>字幕译文（按语言对照填写）</span>
                <Button
                  className="subtitle-editor-button"
                  disabled={!activeLine.text.trim() || isTranslatingSingle || !onTranslateSingle}
                  icon={<Languages size={14} aria-hidden="true" />}
                  onClick={async () => {
                    if (!onTranslateSingle) return
                    setIsTranslatingSingle(true)
                    try {
                      const translations = await onTranslateSingle(activeLine.text)
                      const cleanedTranslations = { ...activeLine.translations }
                      Object.entries(translations).forEach(([locale, value]) => {
                        cleanedTranslations[locale as ContentLocale] = cleanSubtitleSpacing(value ?? '')
                      })
                      onUpdateLine(activeLineIndex, { translations: cleanedTranslations })
                    } finally {
                      setIsTranslatingSingle(false)
                    }
                  }}
                  size="small"
                >
                  {isTranslatingSingle ? '翻译中...' : 'AI 翻译本句'}
                </Button>
              </div>
              {TRANSLATION_TARGET_LOCALES.map((locale) => (
                <label className="translation-locale-row" key={locale}>
                  <span>{TRANSLATION_LOCALE_LABELS[locale]}</span>
                  <Input
                    size="small"
                    value={activeLine.translations[locale] ?? ''}
                    onChange={(event) => onUpdateLine(activeLineIndex, { translations: { ...activeLine.translations, [locale]: event.target.value } })}
                    onBlur={(event) => onUpdateLine(activeLineIndex, { translations: { ...activeLine.translations, [locale]: cleanSubtitleSpacing(event.target.value) } })}
                  />
                </label>
              ))}
            </div>
            <div className="field wide answer-field">
              <span>其他可接受答案</span>
              <div className="answer-input-list">
                {(activeLine.answers ?? []).map((answer, answerIndex) => (
                  <div className="answer-input-row" key={answerIndex}>
                    <Input
                      size="small"
                      value={answer}
                      onChange={(event) => {
                        const answers = [...(activeLine.answers ?? [])]
                        answers[answerIndex] = event.target.value
                        onUpdateLine(activeLineIndex, { answers })
                      }}
                      onBlur={(event) => {
                        const answers = [...(activeLine.answers ?? [])]
                        answers[answerIndex] = cleanEnglishAnswerText(event.target.value)
                        onUpdateLine(activeLineIndex, { answers })
                      }}
                      placeholder="填写另一种可接受答案"
                    />
                    <Button
                      className="subtitle-editor-button"
                      danger
                      onClick={() => onUpdateLine(activeLineIndex, { answers: (activeLine.answers ?? []).filter((_, index) => index !== answerIndex) })}
                      size="small"
                    >
                      删除
                    </Button>
                  </div>
                ))}
                <Button
                  className="subtitle-editor-button"
                  icon={<ListPlus size={14} aria-hidden="true" />}
                  onClick={() => onUpdateLine(activeLineIndex, { answers: [...(activeLine.answers ?? []), ''] })}
                  size="small"
                  type="dashed"
                >
                  添加答案
                </Button>
              </div>
            </div>
            <label className="field wide">
              <span>关键词，逗号分隔</span>
              <Input
                size="small"
                value={activeLine.keywordsText}
                onChange={(event) => onUpdateLine(activeLineIndex, { keywordsText: event.target.value })}
              />
            </label>
          </div>
          </div>
        ) : (
          <div className="subtitle-empty-state">当前没有选中的字幕。</div>
        )}
      </div>
    </aside>
  )
}
