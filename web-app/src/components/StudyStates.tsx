import { useLanguage } from '../i18n/LanguageProvider'
import '../styles/study-states.css'

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

export function CatalogErrorState() {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state error" aria-label={t('study.catalogError.aria')}>
      <div className="icon-wrapper">🔌</div>
      <p className="eyebrow">{t('study.catalogError.eyebrow')}</p>
      <h2>{t('study.catalogError.title')}</h2>
      <p>{t('study.catalogError.body')}</p>
    </section>
  )
}

export function ExerciseLoadingState() {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state loading" aria-label={t('study.loading.aria')}>
      <div className="icon-wrapper">⏳</div>
      <p className="eyebrow">{t('study.loading.eyebrow')}</p>
      <h2>{t('study.loading.title')}</h2>
      <p>{t('study.loading.body')}</p>
    </section>
  )
}

export function ExerciseErrorState() {
  const { t } = useLanguage()
  return (
    <section className="empty-study-state error" aria-label={t('study.exerciseError.aria')}>
      <div className="icon-wrapper">⚠️</div>
      <p className="eyebrow">{t('study.exerciseError.eyebrow')}</p>
      <h2>{t('study.exerciseError.title')}</h2>
      <p>{t('study.exerciseError.body')}</p>
    </section>
  )
}
