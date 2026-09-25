import type { AdminSponsor, SaveSponsorRequest, Sponsor } from '@duolinting/shared' with { 'resolution-mode': 'import' };
import { Op } from 'sequelize';
import { SponsorModel, type SponsorDb } from '../../models/schema/SponsorDB';

const toSponsor = (row: SponsorModel): AdminSponsor => ({
    id: Number(row.id),
    name: row.name,
    description: row.description,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    sortOrder: row.sort_order,
    isPublished: Boolean(row.is_published),
    startsAt: row.starts_at?.toISOString() ?? null,
    endsAt: row.ends_at?.toISOString() ?? null,
    bannerImageUrl: row.banner_image_url,
    bannerTargetUrl: row.banner_target_url,
});

export async function listSponsors(): Promise<Sponsor[]> {
    const now = new Date();
    const rows = await SponsorModel.findAll({
        where: {
            is_published: true,
            [Op.and]: [
                { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
                { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }] },
            ],
        },
        order: [['sort_order', 'ASC'], ['id', 'ASC']],
    });
    return rows.map((row) => ({
        // Public response deliberately omits publication metadata and unpublished rows.
        id: Number(row.id),
        name: row.name,
        description: row.description,
        logoUrl: row.logo_url,
        websiteUrl: row.website_url,
        sortOrder: row.sort_order,
    }));
}

export async function listAdminSponsors(): Promise<AdminSponsor[]> {
    const rows = await SponsorModel.findAll({ order: [['sort_order', 'ASC'], ['id', 'ASC']] });
    return rows.map(toSponsor);
}

export async function saveSponsor(input: SaveSponsorRequest, id?: number): Promise<AdminSponsor | null> {
    const values = {
        name: input.name.trim(),
        description: input.description.trim(),
        logo_url: input.logoUrl?.trim() || null,
        website_url: input.websiteUrl?.trim() || null,
        sort_order: input.sortOrder,
        is_published: input.isPublished,
        starts_at: input.startsAt ? new Date(input.startsAt) : null,
        ends_at: input.endsAt ? new Date(input.endsAt) : null,
        banner_image_url: input.bannerImageUrl?.trim() || null,
        banner_target_url: input.bannerTargetUrl?.trim() || null,
    };
    if (id) {
        const row = await SponsorModel.findByPk(id);
        if (!row) return null;
        await row.update(values);
        return toSponsor(row);
    }
    return toSponsor(await SponsorModel.create(values as SponsorDb));
}

export async function deleteSponsor(id: number): Promise<boolean> {
    return (await SponsorModel.destroy({ where: { id } })) > 0;
}
