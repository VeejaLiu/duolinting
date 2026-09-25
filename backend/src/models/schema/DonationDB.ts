import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

export interface DonationDb {
    id: number;
    donor_name: string | null;
    is_anonymous: boolean;
    amount: string;
    currency: string;
    donation_item: string;
    donated_at: Date;
    reference_note: string;
    is_published: boolean;
    created_at?: Date;
    updated_at?: Date;
}

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    donor_name: { type: Sequelize.STRING(120), allowNull: true },
    is_anonymous: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
    currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'CNY' },
    donation_item: { type: Sequelize.STRING(160), allowNull: false, defaultValue: '' },
    donated_at: { type: Sequelize.DATE, allowNull: false },
    reference_note: { type: Sequelize.STRING(255), allowNull: false, defaultValue: '' },
    is_published: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export class DonationModel extends Model<DonationDb> implements DonationDb {
    declare id: number;
    declare donor_name: string | null;
    declare is_anonymous: boolean;
    declare amount: string;
    declare currency: string;
    declare donation_item: string;
    declare donated_at: Date;
    declare reference_note: string;
    declare is_published: boolean;
}

DonationModel.init(schema, { ...Defaultconfig, sequelize, tableName: 'donations' });
