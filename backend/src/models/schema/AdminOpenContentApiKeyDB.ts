import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const AdminOpenContentApiKeySchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    name: {
        type: Sequelize.STRING(120),
        allowNull: false,
    },
    key_prefix: {
        type: Sequelize.STRING(32),
        allowNull: false,
    },
    // 数据库绝不保存可直接调用开放接口的原始 Key。
    key_hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true,
    },
    created_by_admin_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
    },
    expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    last_used_at: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface AdminOpenContentApiKeyDb {
    id: number;
    name: string;
    key_prefix: string;
    key_hash: string;
    created_by_admin_id: number;
    expires_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

type AdminOpenContentApiKeyCreation = Omit<
    AdminOpenContentApiKeyDb,
    'id' | 'created_at' | 'updated_at'
>;

export class AdminOpenContentApiKeyModel extends Model<
    AdminOpenContentApiKeyDb,
    AdminOpenContentApiKeyCreation
> {
    public id!: number;
    public name!: string;
    public key_prefix!: string;
    public key_hash!: string;
    public created_by_admin_id!: number;
    public expires_at!: Date | null;
    public last_used_at!: Date | null;
    public created_at!: Date;
    public updated_at!: Date;
}

AdminOpenContentApiKeyModel.init(AdminOpenContentApiKeySchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'admin_open_content_api_keys',
});
