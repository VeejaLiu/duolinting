import express, { ErrorRequestHandler } from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import index from './router';
import { Logger } from './lib/logger';
import { banner } from './lib/banner';
import { loadMonitor } from './loaders/loadMonitor';
import { loadWinston } from './loaders/winstonLoader';
import { env } from './env';
import { closeSequelize } from './models/db-config-mysql';
import { requestLogger } from './lib/requestLogger';

const logger = new Logger(__filename);

async function Main() {
    const app = express();
    // Production traffic reaches Express through one nginx hop. This makes req.ip
    // use nginx's sanitized X-Forwarded-For value for authentication rate limits.
    app.set('trust proxy', 1);
    const server = http.createServer(app);
    const allowedOrigins = env.cors.origins.split(',').map((origin) => origin.trim());
    const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
    const privateNetworkOriginPattern =
        /^https?:\/\/(10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(:\d+)?$/;
    loadWinston();

    app.use(requestLogger);
    app.use((req, res, next) => {
        const origin = req.headers.origin;

        // In local development Expo Web may rotate between loopback/private LAN
        // origins and different ports. These development-only patterns keep
        // phone-based mobile-web requests working without broadening production CORS.
        const isAllowedDevelopmentOrigin =
            env.isDevelopment &&
            typeof origin === 'string' &&
            (localhostOriginPattern.test(origin) || privateNetworkOriginPattern.test(origin));

        if (
            !origin ||
            allowedOrigins.includes(origin) ||
            allowedOrigins.includes('*') ||
            isAllowedDevelopmentOrigin
        ) {
            res.header('Access-Control-Allow-Origin', origin || '*');
        }
        res.header('Access-Control-Allow-Headers', '*');
        res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }
        next();
    });

    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use('/api', index);

    loadMonitor(app);
    const log = new Logger(__filename);

    const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
        void _next;
        logger.error(
            `[APP][Error] id=${res.locals.requestId ?? '-'} ${req.method} ${req.originalUrl} ${err.stack}`,
        );
        res.status(500).send({ success: false, message: 'Something broke!' });
    };
    app.use(errorHandler);

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('SIGINT', async () => {
        logger.info('SIGINT signal received.');
        await closeSequelize();
        process.exit();
    });

    server.listen(Number(env.app.port), env.app.host, () => {
        banner(log);
    });
}

Main().then(() => {
    logger.info('Server started');
});
