import Sequelize, { Model, ModelAttributes } from 'sequelize';
import { Defaultconfig, sequelize } from '../db-config-mysql';

const ExerciseSchema: ModelAttributes = {
    id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
    },
    category_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
    },
    title: {
        type: Sequelize.STRING(180),
        allowNull: false,
    },
    source: {
        type: Sequelize.STRING(180),
        allowNull: false,
    },
    difficulty: {
        type: Sequelize.ENUM('beginner', 'intermediate', 'advanced'),
        allowNull: false,
    },
    duration_label: {
        type: Sequelize.STRING(32),
        allowNull: false,
    },
    media_type: {
        type: Sequelize.ENUM('audio', 'video'),
        allowNull: false,
        defaultValue: 'audio',
    },
    audio_object_name: {
        type: Sequelize.STRING(255),
    },
    audio_url: {
        type: Sequelize.STRING(1024),
        allowNull: false,
    },
    cover_image_url: {
        type: Sequelize.STRING(1024),
        allowNull: true,
    },
    summary: {
        type: Sequelize.TEXT,
        allowNull: false,
    },
    localizations_json: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: {},
    },
    transcript_json: {
        type: Sequelize.JSON,
        allowNull: false,
        defaultValue: [],
    },
    status: {
        type: Sequelize.ENUM('draft', 'proofread', 'published', 'archived'),
        allowNull: false,
    },
    sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    created_at: {
        type: Sequelize.DATE,
    },
    updated_at: {
        type: Sequelize.DATE,
    },
};

export interface ExerciseDb {
    id: number;
    category_id: number;
    title: string;
    source: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    duration_label: string;
    media_type: 'audio' | 'video';
    audio_object_name?: string | null;
    audio_url: string;
    cover_image_url?: string | null;
    summary: string;
    localizations_json: unknown;
    transcript_json: unknown;
    status: 'draft' | 'proofread' | 'published' | 'archived';
    sort_order: number;
}

export class ExerciseModel extends Model<ExerciseDb> {
    public id!: number;
    public category_id!: number;
    public title!: string;
    public source!: string;
    public difficulty!: 'beginner' | 'intermediate' | 'advanced';
    public duration_label!: string;
    public media_type!: 'audio' | 'video';
    public audio_url!: string;
    public cover_image_url!: string | null;
    public summary!: string;
    public localizations_json!: unknown;
    public transcript_json!: unknown;
    public status!: 'draft' | 'proofread' | 'published' | 'archived';
    public sort_order!: number;
}

ExerciseModel.init(ExerciseSchema, {
    ...Defaultconfig,
    sequelize,
    tableName: 'exercises',
});
