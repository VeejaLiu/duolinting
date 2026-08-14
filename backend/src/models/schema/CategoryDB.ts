import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const CategorySchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    group_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
    },
    name: {
        type: Sequelize.STRING(120),
        allowNull: false,
    },
    description: {
        type: Sequelize.STRING(255),
        allowNull: false,
    },
    localizations_json: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
    },
    accent: {
        type: Sequelize.STRING(16),
        allowNull: false,
    },
    cover_image_url: {
        type: Sequelize.STRING(1024),
        allowNull: true,
    },
    sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface CategoryDb {
    id: number;
    group_id: number;
    name: string;
    description: string;
    localizations_json: unknown;
    accent: string;
    cover_image_url?: string | null;
    sort_order: number;
    created_at?: Date;
    updated_at?: Date;
}

export class CategoryModel extends Model<CategoryDb> {
    public id!: number;
    public group_id!: number;
    public name!: string;
    public description!: string;
    public localizations_json!: unknown;
    public accent!: string;
    public cover_image_url!: string | null;
    public sort_order!: number;
}

CategoryModel.init(CategorySchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'categories',
});
