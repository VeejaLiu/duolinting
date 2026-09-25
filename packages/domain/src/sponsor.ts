/** Public sponsor profile; only published records are returned to learner clients. */
export type Sponsor = {
  id: number
  name: string
  description: string
  logoUrl: string | null
  websiteUrl: string | null
  sortOrder: number
}

export type AdminSponsor = Sponsor & {
  isPublished: boolean
  startsAt: string | null
  endsAt: string | null
  bannerImageUrl: string | null
  bannerTargetUrl: string | null
}

export type SaveSponsorRequest = Omit<AdminSponsor, 'id'>

export type DonationSocialPlatform = 'instagram' | 'x' | 'linkedin' | 'github' | 'weibo' | 'website'

export type DonationSocialLink = {
  platform: DonationSocialPlatform
  url: string
}

/** Public donation excludes private donor identity, payment reference, and receipt. */
export type Donation = {
  id: number
  donorName: string | null
  isAnonymous: boolean
  amount: string
  currency: string
  donatedAt: string
  socialLinks: DonationSocialLink[]
  publicEmail: string | null
}

export type AdminDonation = Donation & {
  donationItem: string
  referenceNote: string
  isPublished: boolean
  hasReceipt: boolean
  showSocialLinksPublicly: boolean
  contactEmail: string | null
  showEmailPublicly: boolean
}

export type SaveDonationRequest = Omit<AdminDonation, 'id' | 'hasReceipt' | 'publicEmail'>
