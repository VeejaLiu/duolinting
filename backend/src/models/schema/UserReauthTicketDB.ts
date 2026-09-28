import Sequelize, { Model, type ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    session_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    purpose: { type: Sequelize.STRING(32), allowNull: false },
    ticket_hash: { type: Sequelize.STRING(64), allowNull: false },
    expires_at: { type: Sequelize.DATE, allowNull: false },
    consumed_at: { type: Sequelize.DATE },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export type ReauthPurpose = 'delete_account' | 'set_password' | 'unlink_identity' | 'link_email';

export class UserReauthTicketModel extends Model {
    declare id: number;
    declare user_id: number;
    declare session_id: number;
    declare purpose: ReauthPurpose;
    declare ticket_hash: string;
    declare expires_at: Date;
    declare consumed_at: Date | null;
}

UserReauthTicketModel.init(schema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'user_reauth_tickets',
});
