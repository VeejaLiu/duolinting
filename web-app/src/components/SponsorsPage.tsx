import type { Donation, Sponsor } from '@duolinting/domain'
import { ArrowLeft, ExternalLink, HeartHandshake } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../i18n/LanguageProvider'
import { apiClient } from '../lib/apiClient'

export function SponsorsPage() {
  const navigate = useNavigate()
  const { t, uiLocale } = useLanguage()
  const [items, setItems] = useState<Sponsor[]>([])
  const [donations, setDonations] = useState<Donation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    apiClient.getDonations().then(({ items }) => {
      if (active) setDonations(items)
    }).catch(() => {
      if (active) setError(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    apiClient.getSponsors().then(({ items }) => {
      if (active) setItems(items)
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  return <main className="sponsors-page">
    <div className="sponsors-container">
      <button className="sponsors-back" type="button" onClick={() => navigate('/') }><ArrowLeft size={18} />{t('sponsors.back')}</button>
      <header className="sponsors-hero">
        <span className="sponsors-hero-icon"><HeartHandshake size={34} /></span>
        <h1>{t('sponsors.title')}</h1>
        <p>{t('sponsors.subtitle')}</p>
      </header>
      {loading ? <p className="sponsors-state" role="status">{t('sponsors.loading')}</p> : error ? <p className="sponsors-state" role="alert">{t('sponsors.error')}</p> : <>
        <section aria-labelledby="donation-title">
          <h2 id="donation-title" className="sponsors-section-title">{t('sponsors.donations')}</h2>
          {donations.length === 0 ? <p className="sponsors-state">{t('sponsors.emptyDonations')}</p> : <div className="donation-list">
            {donations.map((donation) => <article className="donation-row" key={donation.id}>
              <span className="donation-avatar" aria-hidden="true"><HeartHandshake size={20} /></span>
              <div className="donation-identity">
                <strong>{donation.isAnonymous ? t('sponsors.anonymous') : donation.donorName}</strong>
                <time dateTime={donation.donatedAt}>{new Intl.DateTimeFormat(uiLocale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(donation.donatedAt))}</time>
                {!donation.isAnonymous && (donation.socialLinks.length > 0 || donation.publicEmail) ? <div className="donation-links">
                  {donation.socialLinks.map((link) => <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer">{t(`sponsors.social.${link.platform}`)}<ExternalLink size={12} aria-hidden="true" /></a>)}
                  {donation.publicEmail ? <a href={`mailto:${donation.publicEmail}`}>{t('sponsors.social.email')}<ExternalLink size={12} aria-hidden="true" /></a> : null}
                </div> : null}
              </div>
              <strong className="donation-amount">{new Intl.NumberFormat(uiLocale, { style: 'currency', currency: donation.currency }).format(Number(donation.amount))}</strong>
            </article>)}
          </div>}
        </section>
        {items.length > 0 ? <section className="sponsors-corporate" aria-labelledby="corporate-title">
          <h2 id="corporate-title" className="sponsors-section-title">{t('sponsors.partners')}</h2>
          <div className="sponsors-grid">
          {items.map((sponsor) => <article className="sponsor-card" key={sponsor.id}>
            <div className="sponsor-logo">{sponsor.logoUrl ? <img src={apiClient.resolveApiUrl(sponsor.logoUrl)} alt="" /> : <HeartHandshake size={30} aria-hidden="true" />}</div>
            <h2>{sponsor.name}</h2>
            {sponsor.description ? <p>{sponsor.description}</p> : null}
            {sponsor.websiteUrl ? <a href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer">{t('sponsors.visit')}<ExternalLink size={15} aria-hidden="true" /></a> : null}
          </article>)}
          </div>
        </section> : null}
      </>}
    </div>
  </main>
}
