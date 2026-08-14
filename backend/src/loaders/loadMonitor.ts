import basicAuth from 'express-basic-auth';
import { env } from '../env';

const monitor = require('express-status-monitor');

export const loadMonitor = (expressApp: any | undefined) => {
    if (expressApp && env.monitor.enabled) {
        expressApp.use(monitor());
        expressApp.get(
            env.monitor.route,
            env.monitor.username
                ? basicAuth({
                      users: {
                          [`${env.monitor.username}`]: env.monitor.password,
                      },
                      challenge: true,
                  })
                : (req: any, res: any, next: any) => next(),
            monitor().pageRoute,
        );
    }
};
