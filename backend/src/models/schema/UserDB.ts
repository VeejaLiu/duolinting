import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const UserSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
    },
    display_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
    },
    is_preview_volunteer: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    password_hash: {
        type: Sequelize.STRING(255),
    },
    token: {
        type: Sequelize.TEXT,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface UserDb {
    id: number;
    email: string;
    display_name: string;
    is_preview_volunteer: boolean;
    password_hash: string | null;
    token?: string | null;
    created_at?: Date;
    updated_at?: Date;
}

export class UserModel extends Model<UserDb> {
    declare id: number;
    declare email: string;
    declare display_name: string;
    declare is_preview_volunteer: boolean;
    declare password_hash: string | null;
    declare token: string | null;

    public static async getRawByID({ id }: { id: string | number }) {
        const res = await UserModel.findOne({
            where: { id },
            raw: true,
        });
        if (!res) {
            throw new Error(`User not found with id: ${id}`);
        }
        return res;
    }
}

UserModel.init(UserSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'users',
});
