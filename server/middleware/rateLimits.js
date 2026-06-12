import rateLimit from 'express-rate-limit';

/**
 * Rate limiting for expensive endpoints (Puppeteer captures, paid LLM calls).
 * The app is single-user, so limits are generous — they exist to stop runaway
 * loops and abuse from the trusted network, not to shape legitimate traffic.
 */
export const makeLimiter = ({ windowMs, max, skip } = {}) => rateLimit({
    windowMs,
    max,
    skip,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests — slow down and retry shortly.' }),
});

export const expensiveRouteLimiter = makeLimiter({
    windowMs: 5 * 60 * 1000,
    max: 30,
    // Unit tests hammer these routes; the limiter is production behavior
    skip: () => process.env.NODE_ENV === 'test',
});
