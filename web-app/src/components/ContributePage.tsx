import { ArrowLeft, Check, CheckCheck, Copy, ExternalLink, FileText, HandHeart, Headphones, Link2, Mail } from 'lucide-react'
import { FaDiscord, FaQq, FaWeixin } from 'react-icons/fa'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageProvider'

const contributionEmail = import.meta.env.VITE_CONTRIBUTION_EMAIL || 'veejaliu@outlook.com'
const wechatId = '15352290342'
const discordId = '924180303487066182'
const qqId = '1209898373'

export function ContributePage() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [copiedContact, setCopiedContact] = useState<'wechat' | 'discord' | 'qq' | null>(null)
  const mailto = `mailto:${contributionEmail}?subject=${encodeURIComponent(t('contribute.emailSubject'))}&body=${encodeURIComponent(t('contribute.emailBody'))}`
  const contributionTypes = [
    { Icon: Headphones, key: 'material' },
    { Icon: FileText, key: 'subtitleItem' },
    { Icon: Link2, key: 'lead' },
  ]

  const copyContact = async (kind: 'wechat' | 'discord' | 'qq', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedContact(kind)
    window.setTimeout(() => setCopiedContact((current) => current === kind ? null : current), 1800)
  }

  return (
    <main className="contribute-page">
      <div className="contribute-container">
        <button className="contribute-back" onClick={() => navigate(-1)} type="button">
          <ArrowLeft size={18} aria-hidden="true" />
          {t('contribute.back')}
        </button>

        <header className="contribute-hero">
          <div className="contribute-illustration" aria-hidden="true">
            <Headphones size={43} />
            <span><HandHeart size={22} /></span>
          </div>
          <p className="contribute-eyebrow">{t('contribute.eyebrow')}</p>
          <h1>{t('contribute.title')}</h1>
          <p className="contribute-subtitle">{t('contribute.subtitle')}</p>
        </header>

        <section className="contribute-section" aria-labelledby="contribute-welcome">
          <h2 id="contribute-welcome">{t('contribute.welcome')}</h2>
          <div className="contribute-options">
            {contributionTypes.map(({ Icon, key }, index) => (
              <article className="contribute-option" key={key} style={{ '--option-index': index } as CSSProperties}>
                <span className="contribute-option-icon"><Icon size={21} /></span>
                <div>
                  <h3>{t(`contribute.${key}.title`)}</h3>
                  <p>{t(`contribute.${key}.description`)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="contribute-prepare">
          <h2>{t('contribute.prepare')}</h2>
          {['name', 'reason', 'rights'].map((key) => (
            <p key={key}><Check size={16} aria-hidden="true" />{t(`contribute.prepare.${key}`)}</p>
          ))}
        </section>

        <a
          className="contribute-contact"
          href={mailto}
          rel="noreferrer"
          target="_blank"
        >
          <Mail size={20} aria-hidden="true" />
          {t('contribute.contact')}
        </a>
        <section className="contribute-channels" aria-labelledby="contribute-channels-title">
          <h2 id="contribute-channels-title">{t('contribute.otherContacts')}</h2>
          <div className="contribute-channel-grid">
            <button className="contribute-channel" onClick={() => void copyContact('wechat', wechatId)} type="button">
              <span className="contribute-channel-icon wechat"><FaWeixin size={25} /></span>
              <span className="contribute-channel-copy">
                <span className="contribute-channel-name">{t('contribute.wechat')}</span>
                <strong>{wechatId}</strong>
              </span>
              <span className={`contribute-channel-action ${copiedContact === 'wechat' ? 'copied' : ''}`}>
                {copiedContact === 'wechat' ? <CheckCheck size={17} /> : <Copy size={17} />}
                <span>{copiedContact === 'wechat' ? t('contribute.copied') : t('contribute.copy')}</span>
              </span>
            </button>
            <a className="contribute-channel" href={`https://discord.com/users/${discordId}`} rel="noreferrer" target="_blank">
              <span className="contribute-channel-icon discord"><FaDiscord size={25} /></span>
              <span className="contribute-channel-copy">
                <span className="contribute-channel-name">Discord</span>
                <strong>{discordId}</strong>
              </span>
              <span className="contribute-channel-action">
                <ExternalLink size={17} />
                <span>{t('contribute.open')}</span>
              </span>
            </a>
            <button className="contribute-channel" onClick={() => void copyContact('qq', qqId)} type="button">
              <span className="contribute-channel-icon qq"><FaQq size={25} /></span>
              <span className="contribute-channel-copy">
                <span className="contribute-channel-name">QQ</span>
                <strong>{qqId}</strong>
              </span>
              <span className={`contribute-channel-action ${copiedContact === 'qq' ? 'copied' : ''}`}>
                {copiedContact === 'qq' ? <CheckCheck size={17} /> : <Copy size={17} />}
                <span>{copiedContact === 'qq' ? t('contribute.copied') : t('contribute.copy')}</span>
              </span>
            </button>
          </div>
        </section>
        <p className="contribute-note">{t('contribute.note')}</p>
      </div>
    </main>
  )
}
