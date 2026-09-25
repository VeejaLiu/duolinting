import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

export interface DonationReceiptDb {
    id: number;
    donation_id: number;
    content_type: string;
    file_name: string;
    file_data: Buffer;
    created_at?: Date;
    updated_at?: Date;
}

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    donation_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true },
    content_type: { type: Sequelize.STRING(32), allowNull: false },
    file_name: { type: Sequelize.STRING(255), allowNull: false },
    file_data: { type: Sequelize.BLOB('medium'), allowNull: false },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export class DonationReceiptModel extends Model<DonationReceiptDb> implements DonationReceiptDb {
    public id!: number;
    public donation_id!: number;
    public content_type!: string;
    public file_name!: string;
    public file_data!: Buffer;
}

DonationReceiptModel.init(schema, { ...Defaultconfig, sequelize, tableName: 'donation_receipts' });
