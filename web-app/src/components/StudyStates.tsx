import { useLanguage } from '../i18n/LanguageProvider'
import '../styles/study-states.css'

type RecoveryProps = { onRetry: () => void; retrying: boolean }

function RetryAction({ onRetry, retrying }: RecoveryProps) {
  const { t } = useLanguage()
  return (
    <button className="study-retry-button" type="button" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
      {t(retrying ? 'study.retrying' : 'study.retry')}
    </button>
  )
}

export function LoadRecoveryNotice({ message, ...recovery }: RecoveryProps & { message: string }) {
  return (
    <div className="study-recovery-notice" role="status" aria-live="polite">
      <p>{message}</p>
      <RetryAction {...recovery} />
    </div>
  )
}

export function EmptyStudyState() {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state empty" aria-label={t('study.empty.aria')}>
      <div className="icon-wrapper">📚</div>
      <p className="eyebrow">{t('study.empty.eyebrow')}</p>
      <h2>{t('study.empty.title')}</h2>
      <p>{t('study.empty.body')}</p>
    </section>
  )
}

export function CatalogErrorState(recovery: RecoveryProps) {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state error" aria-label={t('study.catalogError.aria')}>
      <div className="icon-wrapper">🔌</div>
      <p className="eyebrow">{t('study.catalogError.eyebrow')}</p>
      <h2>{t('study.catalogError.title')}</h2>
      <p>{t('study.catalogError.body')}</p>
      <RetryAction {...recovery} />
    </section>
  )
}

export function ExerciseLoadingState() {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state loading" aria-label={t('study.loading.aria')} role="status" aria-live="polite" aria-busy="true">
      <div className="icon-wrapper">⏳</div>
      <p className="eyebrow">{t('study.loading.eyebrow')}</p>
      <h2>{t('study.loading.title')}</h2>
      <p>{t('study.loading.body')}</p>
    </section>
  )
}

export function ExerciseErrorState(recovery: RecoveryProps) {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state error" aria-label={t('study.exerciseError.aria')}>
      <div className="icon-wrapper">⚠️</div>
      <p className="eyebrow">{t('study.exerciseError.eyebrow')}</p>
      <h2>{t('study.exerciseError.title')}</h2>
      <p>{t('study.exerciseError.body')}</p>
      <RetryAction {...recovery} />
    </section>
  )
}

export function CategoryErrorState(recovery: RecoveryProps) {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state error" aria-label={t('study.chapterError.title')}>
      <div className="icon-wrapper" aria-hidden="true">🔌</div>
      <h2>{t('study.chapterError.title')}</h2>
      <p>{t('study.catalogError.body')}</p>
      <RetryAction {...recovery} />
    </section>
  )
}
