import { isIP } from 'node:net';
import type { DonationSocialLink, DonationSocialPlatform } from '@duolinting/shared' with { 'resolution-mode': 'import' };

const allowedDomains: Record<Exclude<DonationSocialPlatform, 'website'>, string[]> = {
    instagram: ['instagram.com'],
    x: ['x.com', 'twitter.com'],
    linkedin: ['linkedin.com'],
    github: ['github.com'],
    weibo: ['weibo.com', 'weibo.cn'],
};
const platforms = new Set<DonationSocialPlatform>(['instagram', 'x', 'linkedin', 'github', 'weibo', 'website']);

// A platform chip should lead to that platform, while personal sites may use any
// public HTTPS hostname. This also blocks javascript:, local hosts and IP links.
export const isValidDonationSocialLinks = (value: unknown): value is DonationSocialLink[] => {
    if (!Array.isArray(value) || value.length > 6) return false;
    const seen = new Set<string>();
    return value.every((link) => {
        if (!link || typeof link !== 'object' ||
            !platforms.has(link.platform) || typeof link.url !== 'string' ||
            !link.url.trim() || link.url.length > 1024 || seen.has(link.platform)) return false;
        seen.add(link.platform);
        try {
            const url = new URL(link.url.trim());
            const hostname = url.hostname.toLowerCase();
            if (url.protocol !== 'https:' || url.username || url.password ||
                hostname === 'localhost' || !hostname.includes('.') || isIP(hostname)) return false;
            const platform = link.platform as DonationSocialPlatform;
            if (platform === 'website') return true;
            return allowedDomains[platform].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
        } catch {
            return false;
        }
    });
};

export const normalizeDonationSocialLinks = (value: unknown): DonationSocialLink[] =>
    isValidDonationSocialLinks(value)
        ? value.map((link) => ({ platform: link.platform, url: link.url.trim() }))
        : [];
