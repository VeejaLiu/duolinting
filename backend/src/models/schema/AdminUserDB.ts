import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const AdminUserSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    username: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
    },
    email: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
    },
    learner_user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        unique: true,
    },
    display_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
    },
    last_display_name_changed_at: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
    },
    role: {
        type: Sequelize.STRING(40),
        allowNull: false,
    },
    must_change_password: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    token: {
        type: Sequelize.TEXT,
    },
    token_expires_at: {
        type: Sequelize.DATE,
    },
    last_login_at: {
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
    email?: string | null;
    learner_user_id?: number | null;
    display_name: string;
    last_display_name_changed_at?: Date | null;
    password_hash: string;
    role: 'super_admin' | 'subtitle_contributor' | 'admin';
    must_change_password: boolean;
    is_active: boolean;
    token?: string | null;
    token_expires_at?: Date | null;
    last_login_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export class AdminUserModel extends Model<AdminUserDb> {
    declare id: number;
    declare username: string;
    declare email: string | null;
    declare learner_user_id: number | null;
    declare display_name: string;
    declare last_display_name_changed_at: Date | null;
    declare password_hash: string;
    declare role: 'super_admin' | 'subtitle_contributor' | 'admin';
    declare must_change_password: boolean;
    declare is_active: boolean;
    declare token: string | null;
    declare token_expires_at: Date | null;
    declare last_login_at: Date | null;
}

AdminUserModel.init(AdminUserSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'admin_users',
});
