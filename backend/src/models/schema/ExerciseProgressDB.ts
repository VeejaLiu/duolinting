import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const ExerciseProgressSchema: ModelAttributes = {
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
    last_line_id: {
        type: Sequelize.STRING(96),
        allowNull: false,
    },
    show_translation: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
    },
    hide_transcript: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
    },
    playback_rate: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: false,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export class ExerciseProgressModel extends Model {}

ExerciseProgressModel.init(ExerciseProgressSchema, {
    ...Defaultconfig,
    createdAt: false,
    sequelize,
    tableName: 'exercise_progress',
});
