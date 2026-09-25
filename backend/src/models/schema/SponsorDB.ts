import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

export interface SponsorDb {
    id: number;
    name: string;
    description: string;
    logo_url: string | null;
    website_url: string | null;
    sort_order: number;
    is_published: boolean;
    starts_at: Date | null;
    ends_at: Date | null;
    banner_image_url: string | null;
    banner_target_url: string | null;
    created_at?: Date;
    updated_at?: Date;
}

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: Sequelize.STRING(160), allowNull: false },
    description: { type: Sequelize.STRING(600), allowNull: false, defaultValue: '' },
    logo_url: { type: Sequelize.STRING(1024), allowNull: true },
    website_url: { type: Sequelize.STRING(1024), allowNull: true },
    sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    is_published: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    starts_at: { type: Sequelize.DATE, allowNull: true },
    ends_at: { type: Sequelize.DATE, allowNull: true },
    banner_image_url: { type: Sequelize.STRING(1024), allowNull: true },
    banner_target_url: { type: Sequelize.STRING(1024), allowNull: true },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export class SponsorModel extends Model<SponsorDb> implements SponsorDb {
    declare id: number;
    declare name: string;
    declare description: string;
    declare logo_url: string | null;
    declare website_url: string | null;
    declare sort_order: number;
    declare is_published: boolean;
    declare starts_at: Date | null;
    declare ends_at: Date | null;
    declare banner_image_url: string | null;
    declare banner_target_url: string | null;
}

SponsorModel.init(schema, { ...Defaultconfig, sequelize, tableName: 'sponsors' });
