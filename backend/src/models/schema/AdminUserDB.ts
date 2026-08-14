import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const AdminUserSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    username: {
        type: Sequelize.STRING(80),
        allowNull: false,
        unique: true,
    },
    display_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
    },
    password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
    },
    role: {
        type: Sequelize.STRING(40),
        allowNull: false,
    },
    token: {
        type: Sequelize.TEXT,
    },
    token_expires_at: {
        type: Sequelize.DATE,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface AdminUserDb {
    id: number;
    username: string;
    display_name: string;
    password_hash: string;
    role: string;
    token?: string | null;
    token_expires_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export class AdminUserModel extends Model<AdminUserDb> {
    declare id: number;
    declare username: string;
    declare display_name: string;
    declare password_hash: string;
    declare role: string;
    declare token: string | null;
    declare token_expires_at: Date | null;
}

AdminUserModel.init(AdminUserSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'admin_users',
});
