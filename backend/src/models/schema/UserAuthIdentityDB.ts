import Sequelize, { Model, type ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

export type OAuthProvider = 'google' | 'apple';

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    provider: { type: Sequelize.STRING(16), allowNull: false },
    issuer: { type: Sequelize.STRING(255), allowNull: false },
    provider_subject: { type: Sequelize.STRING(255), allowNull: false },
    client_id: { type: Sequelize.STRING(255) },
    provider_email: { type: Sequelize.STRING(255) },
    provider_email_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    refresh_token_ciphertext: { type: Sequelize.TEXT },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export class UserAuthIdentityModel extends Model {
    declare id: number;
    declare user_id: number;
    declare provider: OAuthProvider;
    declare issuer: string;
    declare provider_subject: string;
    declare client_id: string | null;
    declare provider_email: string | null;
    declare provider_email_verified: boolean;
    declare refresh_token_ciphertext: string | null;
}

UserAuthIdentityModel.init(schema, { ...Defaultconfig, sequelize, tableName: 'user_auth_identities' });
