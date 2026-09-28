import { Op } from 'sequelize';
import { AuthTransactionModel } from '../../models/schema/AuthTransactionDB';
import { UserEmailChallengeModel } from '../../models/schema/UserEmailChallengeDB';
import { UserReauthTicketModel } from '../../models/schema/UserReauthTicketDB';
import { Logger } from '../../lib/logger';

const logger = new Logger(__filename);
const RETENTION_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

/** Purge expired secrets and verified provider claims after a short recovery
 * window. Challenge delivery counts need only the most recent hour. */
export function startAuthMaintenance() {
    const purge = async () => {
        const cutoff = new Date(Date.now() - RETENTION_MS);
        try {
            await AuthTransactionModel.destroy({ where: { expires_at: { [Op.lt]: cutoff } } });
            await UserReauthTicketModel.destroy({ where: { expires_at: { [Op.lt]: cutoff } } });
            await UserEmailChallengeModel.destroy({ where: { expires_at: { [Op.lt]: cutoff } } });
        } catch (error) {
            // Do not log row contents, codes, tokens or provider assertions.
            logger.error(`[auth-maintenance] expired-record cleanup failed: ${error instanceof Error ? error.name : 'unknown'}`);
        }
    };
    const timer = setInterval(() => { void purge(); }, INTERVAL_MS);
    timer.unref();
    void purge();
}
