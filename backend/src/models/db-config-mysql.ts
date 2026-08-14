import { Sequelize } from 'sequelize';
import { env } from '../env';
import { Logger } from '../lib/logger';

const logger = new Logger(__filename);

export const Defaultconfig = {
    timestamps: true,
    freezeTableName: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

export const sequelize = new Sequelize(env.mysql.database, env.mysql.username, env.mysql.password, {
    host: env.mysql.host,
    port: env.mysql.port,
    dialect: 'mysql',
    pool: {
        max: 20,
        min: 0,
        acquire: 120000,
        idle: 5000,
    },
    dialectOptions: {
        charset: 'utf8mb4',
    },
    logging: env.mysql.logging,
    benchmark: true,
});

export async function closeSequelize() {
    logger.info('Closing sequelize connection');
    await sequelize.close();
    logger.info('Sequelize connection closed');
}
