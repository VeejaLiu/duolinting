import { configure, format, transports } from 'winston';

import { env } from '../env';

export const loadWinston = () => {
    configure({
        transports: [
            new transports.Console({
                level: env.log.level,
                handleExceptions: true,
                format: format.combine(format.colorize(), format.simple()),
            }),
        ],
    });
};
