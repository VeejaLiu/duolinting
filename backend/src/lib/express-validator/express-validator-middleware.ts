import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { Logger } from '../logger';

const logger = new Logger(__filename);

export const validateErrorCheck = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.warn(
            `[validation] requestId=${res.locals.requestId ?? '-'} ${req.method} ${req.originalUrl} errors=${JSON.stringify(errors.array())}`,
        );
        res.status(400).json({ success: false, message: 'Invalid request', errors: errors.array() });
    } else {
        next();
    }
};
