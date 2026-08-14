import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const LineProgressSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
    },
    exercise_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
    },
    line_id: {
        type: Sequelize.STRING(96),
        allowNull: false,
    },
    unclear: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
    },
    mastered: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
    },
    repeat_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    note: {
        type: Sequelize.TEXT,
        allowNull: false,
    },
    dictation: {
        type: Sequelize.TEXT,
        allowNull: false,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export class LineProgressModel extends Model {}

LineProgressModel.init(LineProgressSchema, {
    ...Defaultconfig,
    createdAt: false,
    sequelize,
    tableName: 'line_progress',
});
