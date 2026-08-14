import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const VocabularyItemSchema: ModelAttributes = {
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
    word: {
        type: Sequelize.STRING(180),
        allowNull: false,
    },
    context: {
        type: Sequelize.TEXT,
        allowNull: false,
    },
    mastery_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
    },
    next_review_at: {
        type: Sequelize.DATE,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export class VocabularyItemModel extends Model {}

VocabularyItemModel.init(VocabularyItemSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'vocabulary_items',
});
