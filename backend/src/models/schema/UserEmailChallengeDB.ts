import Sequelize, { Model, type ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

export type UserEmailChallengePurpose = 'register' | 'password_reset';

const UserEmailChallengeSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    email: {
        type: Sequelize.STRING(255),
        allowNull: false,
    },
    purpose: {
        // Keep the database column forward-compatible with future challenge
        // purposes; application code still narrows it to the two values above.
        type: Sequelize.STRING(32),
        allowNull: false,
    },
    code_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
    },
    failed_attempts: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
    },
    consumed_at: {
        type: Sequelize.DATE,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface UserEmailChallengeDb {
    id: number;
    email: string;
    purpose: UserEmailChallengePurpose;
    code_hash: string;
    failed_attempts: number;
    expires_at: Date;
    consumed_at?: Date | null;
    created_at?: Date;
    updated_at?: Date;
}

export class UserEmailChallengeModel extends Model<UserEmailChallengeDb> {
    declare id: number;
    declare email: string;
    declare purpose: UserEmailChallengePurpose;
    declare code_hash: string;
    declare failed_attempts: number;
    declare expires_at: Date;
    declare consumed_at: Date | null;
    declare created_at: Date;
    declare updated_at: Date;
}

UserEmailChallengeModel.init(UserEmailChallengeSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'user_email_challenges',
    indexes: [
        { fields: ['email', 'purpose', 'created_at'] },
        { fields: ['expires_at', 'consumed_at'] },
    ],
});
