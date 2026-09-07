import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
);
const explicitEnvFileIndex = process.argv.indexOf('--env-file');
const explicitEnvFile =
    explicitEnvFileIndex >= 0 ? process.argv[explicitEnvFileIndex + 1] : undefined;

if (explicitEnvFileIndex >= 0 && !explicitEnvFile) {
    throw new Error('--env-file 后必须提供配置文件路径。');
}

// npm workspace 启动后端时工作目录是 backend，因此 backend/.env 与后端实际
// 读取的配置一致；没有该文件时才回退到仓库根目录的标准 .env。
const envFile = explicitEnvFile
    ? path.resolve(repositoryRoot, explicitEnvFile)
    : [
          path.join(repositoryRoot, 'backend', '.env'),
          path.join(repositoryRoot, '.env'),
      ].find(existsSync);

if (!envFile || !existsSync(envFile)) {
    throw new Error(
        '找不到本地环境配置。请创建 backend/.env 或根目录 .env。',
    );
}

const fileEnvironment = {};
const parsed = dotenv.config({
    path: envFile,
    processEnv: fileEnvironment,
    quiet: true,
});

if (parsed.error) {
    throw parsed.error;
}

// 与后端一致：终端显式传入的环境变量优先于 .env。
const environment = { ...fileEnvironment, ...process.env };
const databaseHost = (environment.MYSQL_HOST || '127.0.0.1').trim();
const databasePort = (environment.MYSQL_PORT || '3306').trim();
const databaseName = (environment.MYSQL_DATABASE || 'duolinting_app_dev').trim();
const databaseUser = (
    environment.MYSQL_USER ||
    environment.MYSQL_USERNAME ||
    'root'
).trim();
const databasePassword = environment.MYSQL_PASSWORD || '';

// 这是本地维护入口，主动拒绝远程主机，避免误迁移生产或共享数据库。
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localHosts.has(databaseHost)) {
    throw new Error(
        `拒绝迁移非本机数据库主机 ${databaseHost}。远程数据库必须走正式部署流程。`,
    );
}
const databasePortNumber = Number(databasePort);
if (
    !/^\d{1,5}$/.test(databasePort) ||
    databasePortNumber < 1 ||
    databasePortNumber > 65535
) {
    throw new Error('MYSQL_PORT 必须是有效端口号。');
}
if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error('MYSQL_DATABASE 只能包含字母、数字和下划线。');
}
if (!databaseUser) {
    throw new Error('MYSQL_USER 不能为空。');
}

const migrationDirectory = path.join(repositoryRoot, 'infra', 'mysql', 'migrations');
const flywayUrl =
    `jdbc:mysql://host.docker.internal:${databasePort}/${databaseName}` +
    '?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true';
const childEnvironment = {
    ...process.env,
    FLYWAY_URL: flywayUrl,
    FLYWAY_USER: databaseUser,
    FLYWAY_PASSWORD: databasePassword,
};
const result = spawnSync(
    'docker',
    [
        'run',
        '--rm',
        // Docker Desktop 内置该主机名；Linux Docker Engine 需要显式映射到宿主网关。
        '--add-host',
        'host.docker.internal:host-gateway',
        '-v',
        `${migrationDirectory}:/flyway/sql:ro`,
        '-e',
        'FLYWAY_URL',
        '-e',
        'FLYWAY_USER',
        '-e',
        'FLYWAY_PASSWORD',
        '-e',
        'FLYWAY_LOCATIONS=filesystem:/flyway/sql',
        '-e',
        'FLYWAY_BASELINE_ON_MIGRATE=true',
        '-e',
        'FLYWAY_BASELINE_VERSION=202606080000',
        '-e',
        'FLYWAY_VALIDATE_MIGRATION_NAMING=true',
        'flyway/flyway:12.9.0-alpine',
        'migrate',
    ],
    {
        cwd: repositoryRoot,
        env: childEnvironment,
        stdio: 'inherit',
    },
);

if (result.error) {
    throw result.error;
}
process.exitCode = result.status ?? 1;
