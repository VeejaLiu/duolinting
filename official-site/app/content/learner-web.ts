/**
 * Learner web application entry point used by the official website.
 *
 * The address is supplied per build environment. This keeps local testing and
 * production separate, and prevents a public build from ever shipping a
 * loopback URL that would point to each visitor's own device.
 */
const configuredLearnerWebUrl = import.meta.env.VITE_LEARNER_APP_URL?.trim();

export const learnerWebUrl = configuredLearnerWebUrl || null;
