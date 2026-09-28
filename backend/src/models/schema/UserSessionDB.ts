import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

export type AuthClientType = 'web_app' | 'mobile_web' | 'mobile_app';
export type AuthMethod = 'email_password' | 'email_code' | 'apple' | 'google';

const UserSessionSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
    },
    client_type: {
        type: Sequelize.ENUM('web_app', 'mobile_web', 'mobile_app'),
        allowNull: false,
    },
    token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
    },
    auth_method: {
        type: Sequelize.STRING(24),
        allowNull: false,
        defaultValue: 'email_password',
    },
    expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
    },
    last_seen_at: {
        type: Sequelize.DATE,
    },
    revoked_at: {
        type: Sequelize.DATE,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface UserSessionDb {
    id: number;
    user_id: number;
    client_type: AuthClientType;
    token_hash: string;
    auth_method: AuthMethod;
    expires_at: Date;
    last_seen_at?: Date | null;
    revoked_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export class UserSessionModel extends Model<UserSessionDb> {
    declare id: number;
    declare user_id: number;
    declare client_type: AuthClientType;
    declare token_hash: string;
    declare auth_method: AuthMethod;
    declare expires_at: Date;
    declare last_seen_at: Date | null;
    declare revoked_at: Date | null;
}

UserSessionModel.init(UserSessionSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'user_sessions',
    indexes: [
        {
            unique: true,
            fields: ['user_id', 'client_type'],
        },
        {
            fields: ['expires_at'],
        },
    ],
});
