import { DataTypes, Model } from 'sequelize';
import { Defaultconfig, sequelize } from '../../models/db-config-mysql';

const id = { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true };
export class ImportToken extends Model {
    declare id: number;
}
ImportToken.init({
    id, name: DataTypes.STRING(120), key_prefix: DataTypes.STRING(32), key_hash: DataTypes.CHAR(64),
    category_ids_json: DataTypes.JSON, all_categories: DataTypes.BOOLEAN, created_by_admin_id: DataTypes.BIGINT.UNSIGNED,
    expires_at: DataTypes.DATE, revoked_at: DataTypes.DATE, last_used_at: DataTypes.DATE,
}, { ...Defaultconfig, sequelize, tableName: 'content_import_tokens' });

export class ContentImport extends Model {
    declare id: number;
}
ContentImport.init({
    id, token_id: DataTypes.BIGINT.UNSIGNED, idempotency_key: DataTypes.STRING(128),
    request_hash: DataTypes.CHAR(64), source_hash: DataTypes.CHAR(64), request_json: DataTypes.JSON,
    files_json: DataTypes.JSON, artifacts_json: DataTypes.JSON, status: DataTypes.STRING(32), attempt_id: DataTypes.CHAR(36),
    lease_until: DataTypes.DATE, expires_at: DataTypes.DATE, exercise_id: DataTypes.BIGINT.UNSIGNED,
    result_json: DataTypes.JSON, error_json: DataTypes.JSON, cleaned_at: DataTypes.DATE,
}, { ...Defaultconfig, sequelize, tableName: 'content_imports' });
