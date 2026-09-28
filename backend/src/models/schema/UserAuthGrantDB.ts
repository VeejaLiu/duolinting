import Sequelize, { Model, type ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const schema: ModelAttributes = {
    id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    identity_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
    provider: { type: Sequelize.STRING(16), allowNull: false },
    client_id: { type: Sequelize.STRING(255), allowNull: false },
    refresh_token_ciphertext: { type: Sequelize.TEXT, allowNull: false },
    created_at: { type: Sequelize.DATE },
    updated_at: { type: Sequelize.DATE },
};

export class UserAuthGrantModel extends Model {
    declare id: number;
    declare user_id: number;
    declare identity_id: number;
    declare provider: string;
    declare client_id: string;
    declare refresh_token_ciphertext: string;
}

UserAuthGrantModel.init(schema, { ...Defaultconfig, sequelize, tableName: 'user_auth_grants' });
