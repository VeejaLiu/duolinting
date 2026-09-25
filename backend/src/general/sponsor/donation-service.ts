import type { AdminDonation, Donation, SaveDonationRequest } from '@duolinting/shared' with { 'resolution-mode': 'import' };
import { sequelize } from '../../models/db-config-mysql';
import { DonationModel, type DonationDb } from '../../models/schema/DonationDB';
import { DonationReceiptModel, type DonationReceiptDb } from '../../models/schema/DonationReceiptDB';

const toAdminDonation = (row: DonationModel, hasReceipt: boolean): AdminDonation => ({
    id: Number(row.id),
    donorName: row.donor_name,
    isAnonymous: Boolean(row.is_anonymous),
    amount: String(row.amount),
    currency: row.currency,
    donatedAt: row.donated_at.toISOString(),
    donationItem: row.donation_item,
    referenceNote: row.reference_note,
    isPublished: Boolean(row.is_published),
    hasReceipt,
});

export async function listPublicDonations(): Promise<Donation[]> {
    const rows = await DonationModel.findAll({
        where: { is_published: true },
        order: [['donated_at', 'DESC'], ['id', 'DESC']],
    });
    return rows.map((row) => ({
        id: Number(row.id),
        // An anonymous donor's real name may be retained for bookkeeping, never public output.
        donorName: row.is_anonymous ? null : row.donor_name,
        isAnonymous: Boolean(row.is_anonymous),
        amount: String(row.amount),
        currency: row.currency,
        donatedAt: row.donated_at.toISOString(),
    }));
}

export async function listAdminDonations(): Promise<AdminDonation[]> {
    const [rows, receiptRows] = await Promise.all([
        DonationModel.findAll({ order: [['donated_at', 'DESC'], ['id', 'DESC']] }),
        DonationReceiptModel.findAll({ attributes: ['donation_id'] }),
    ]);
    const receiptIds = new Set(receiptRows.map((row) => Number(row.donation_id)));
    return rows.map((row) => toAdminDonation(row, receiptIds.has(Number(row.id))));
}

export async function saveDonation(input: SaveDonationRequest, id?: number): Promise<AdminDonation | null> {
    const values = {
        donor_name: input.donorName?.trim() || null,
        is_anonymous: input.isAnonymous,
        amount: input.amount,
        currency: input.currency,
        donation_item: input.donationItem.trim(),
        donated_at: new Date(input.donatedAt),
        reference_note: input.referenceNote.trim(),
        is_published: input.isPublished,
    };
    if (id) {
        const row = await DonationModel.findByPk(id);
        if (!row) return null;
        await row.update(values);
        const receipt = await DonationReceiptModel.findOne({ where: { donation_id: id }, attributes: ['id'] });
        return toAdminDonation(row, Boolean(receipt));
    }
    return toAdminDonation(await DonationModel.create(values as DonationDb), false);
}

export async function deleteDonation(id: number): Promise<boolean> {
    return sequelize.transaction(async (transaction) => {
        const deleted = await DonationModel.destroy({ where: { id }, transaction });
        if (!deleted) return false;
        await DonationReceiptModel.destroy({ where: { donation_id: id }, transaction });
        return true;
    });
}

export async function saveDonationReceipt(id: number, file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<boolean> {
    const donation = await DonationModel.findByPk(id, { attributes: ['id'] });
    if (!donation) return false;
    const values = {
        donation_id: id,
        content_type: file.mimetype,
        file_name: file.originalname.slice(0, 255),
        file_data: file.buffer,
    };
    const receipt = await DonationReceiptModel.findOne({ where: { donation_id: id } });
    if (receipt) await receipt.update(values);
    else await DonationReceiptModel.create(values as DonationReceiptDb);
    return true;
}

export async function getDonationReceipt(id: number): Promise<DonationReceiptModel | null> {
    return DonationReceiptModel.findOne({ where: { donation_id: id } });
}

export async function deleteDonationReceipt(id: number): Promise<boolean> {
    return (await DonationReceiptModel.destroy({ where: { donation_id: id } })) > 0;
}
