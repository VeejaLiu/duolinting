import Sequelize, { Model, type ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';
import type { OAuthProvider } from './UserAuthIdentityDB';

export type OAuthPurpose = 'login' | 'link' | 'reauth';
export type OAuthPlatform = 'ios' | 'android' | 'web';

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    provider: { type: Sequelize.STRING(16), allowNull: false },
    purpose: { type: Sequelize.STRING(16), allowNull: false },
    reauth_purpose: { type: Sequelize.STRING(32) },
    analytics_epoch_hash: { type: Sequelize.STRING(64) },
    registration_country: { type: Sequelize.STRING(16) },
    registration_geo_source: { type: Sequelize.STRING(32) },
    client_type: { type: Sequelize.STRING(16), allowNull: false },
    platform: { type: Sequelize.STRING(16), allowNull: false },
    nonce: { type: Sequelize.STRING(128), allowNull: false },
    state_hash: { type: Sequelize.STRING(64) },
    verifier_hash: { type: Sequelize.STRING(64) },
    return_origin: { type: Sequelize.STRING(255) },
    user_id: { type: Sequelize.BIGINT.UNSIGNED },
    session_id: { type: Sequelize.BIGINT.UNSIGNED },
    provider_issuer: { type: Sequelize.STRING(255) },
    provider_subject: { type: Sequelize.STRING(255) },
    client_id: { type: Sequelize.STRING(255) },
    provider_email: { type: Sequelize.STRING(255) },
    provider_email_verified: { type: Sequelize.BOOLEAN },
    refresh_token_ciphertext: { type: Sequelize.TEXT },
    exchange_hash: { type: Sequelize.STRING(64) },
    result_user_id: { type: Sequelize.BIGINT.UNSIGNED },
    result_kind: { type: Sequelize.STRING(16) },
    expires_at: { type: Sequelize.DATE, allowNull: false },
    consumed_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export class AuthTransactionModel extends Model {
    declare id: number;
    declare provider: OAuthProvider;
    declare purpose: OAuthPurpose;
    declare reauth_purpose: string | null;
    declare analytics_epoch_hash: string | null;
    declare registration_country: string | null;
    declare registration_geo_source: string | null;
    declare client_type: string;
    declare platform: OAuthPlatform;
    declare nonce: string;
    declare state_hash: string | null;
    declare verifier_hash: string | null;
    declare return_origin: string | null;
    declare user_id: number | null;
    declare session_id: number | null;
    declare provider_issuer: string | null;
    declare provider_subject: string | null;
    declare client_id: string | null;
    declare provider_email: string | null;
    declare provider_email_verified: boolean | null;
    declare refresh_token_ciphertext: string | null;
    declare exchange_hash: string | null;
    declare result_user_id: number | null;
    declare result_kind: string | null;
    declare expires_at: Date;
    declare consumed_at: Date | null;
}

AuthTransactionModel.init(schema, { ...Defaultconfig, sequelize, tableName: 'auth_transactions' });
