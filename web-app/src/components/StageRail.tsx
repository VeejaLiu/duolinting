import type { ComponentType, SVGProps } from 'react'
import { useLanguage } from '../i18n/LanguageProvider'

export type StageRailItem<TStage extends string> = {
  id: TStage
  eyebrow: string
  title: string
  metric: string
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
}

type StageRailProps<TStage extends string> = {
  activeStage: TStage
  completedStages: Partial<Record<TStage, boolean>>
  stages: StageRailItem<TStage>[]
  onStageSelect: (stage: TStage) => void
}

export function StageRail<TStage extends string>({
  activeStage,
  completedStages,
  stages,
  onStageSelect,
}: StageRailProps<TStage>) {
  const { t } = useLanguage()
  return (
    <div className="stage-rail duo-rail" aria-label={t('stageRail.label')}>
      {stages.map((stage, index) => {
        const active = activeStage === stage.id
        const completed = completedStages[stage.id]
        const Icon = stage.Icon
        return (
          <button
            className={[
              'stage-step',
              active ? 'active' : '',
              completed ? 'completed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={stage.id}
            onClick={() => onStageSelect(stage.id)}
            type="button"
          >
            <span className="stage-number">{index + 1}</span>
            <Icon size={20} aria-hidden="true" />
            <span>
              <small>{stage.eyebrow}</small>
              <span className="stage-label">
                <strong>{stage.title}</strong>
                <span className="stage-metric">{stage.metric}</span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
