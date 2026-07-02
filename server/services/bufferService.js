import axios from 'axios';

const BUFFER_GRAPHQL_URL = 'https://api.buffer.com/1/graphql';

/**
 * Buffer's GraphQL query for an organization's connected channels. Requests the
 * superset of fields both callers need (publish.js uses id+service; the buffer
 * smoke test in auth.js also shows name) so one query serves both.
 */
export const CHANNELS_QUERY = `
    query GetChannels($input: ChannelsInput!) {
        channels(input: $input) {
            id
            service
            name
        }
    }
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hard ceiling per attempt so a stalled/throttled Buffer connection can never hang
// a request indefinitely (Test Connection, publish, cleanup all go through here).
const REQUEST_TIMEOUT_MS = 15000;

// Buffer rate-limits bursts ("Too many requests from this client"). A single
// publish hits the API several times in quick succession (channel lookup + one
// createPost per channel), so a throttled call is expected under normal use and
// should be retried, not surfaced as a failure. The throttle arrives either as
// an HTTP 429 (axios throws) or as a 200 body carrying the message in `errors`.
const isThrottleError = (err) =>
    err?.response?.status === 429 ||
    /too many requests/i.test(err?.response?.data?.errors?.[0]?.message || err?.message || '');

const isThrottleData = (data) =>
    /too many requests/i.test(data?.errors?.[0]?.message || '');

// Most recent Buffer rate-limit snapshot (from response headers), or null if
// Buffer hasn't been called yet. Consumed by the client quota banner via
// /api/system/buffer-quota. Buffer reports the most-constrained window (it runs
// a 100-per-15min and a 100-per-day limit) in the x-ratelimit-* trio.
let lastRateLimit = null;
export const getBufferRateLimit = () => lastRateLimit;

// Logs any rate-limit headers Buffer returns and captures the current quota.
const processRateLimitHeaders = (headers) => {
    if (!headers) return;
    const rl = {};
    for (const key of Object.keys(headers)) {
        if (/rate.?limit|retry-after/i.test(key)) rl[key] = headers[key];
    }
    if (!Object.keys(rl).length) return;
    console.log(`[Buffer][ratelimit] ${JSON.stringify(rl)}`);

    const limit = Number(headers['x-ratelimit-limit']);
    const remaining = Number(headers['x-ratelimit-remaining']);
    const reset = Number(headers['x-ratelimit-reset']);   // unix seconds
    const retryAfter = Number(headers['retry-after']);      // seconds
    if (Number.isFinite(limit) && limit > 0 && Number.isFinite(remaining)) {
        lastRateLimit = {
            limit,
            remaining: Math.max(0, remaining),
            resetAt: Number.isFinite(reset) ? reset * 1000
                : (Number.isFinite(retryAfter) ? Date.now() + retryAfter * 1000 : null),
            capturedAt: Date.now(),
        };
    }
};

/**
 * Thin transport wrapper around the Buffer GraphQL endpoint — the one place that
 * knows the URL and auth headers. Returns `response.data` verbatim so each caller
 * keeps its own error inspection (`.errors`) and response shaping. Retries only
 * on rate-limit responses, with exponential backoff (honouring `Retry-After`).
 *
 * @param {string} token Buffer access token
 * @param {string} query GraphQL query/mutation
 * @param {object} variables GraphQL variables
 * @param {object} [opts]
 * @param {number} [opts.retries=3] Max retries on throttling (total tries = retries + 1)
 * @param {number} [opts.baseDelayMs=1000] Base backoff; delay = baseDelayMs * 2**attempt
 * @returns {Promise<object>} The raw GraphQL response body
 */
export const bufferGraphql = async (token, query, variables, { retries = 3, baseDelayMs = 1000 } = {}) => {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await axios.post(BUFFER_GRAPHQL_URL, { query, variables }, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                timeout: REQUEST_TIMEOUT_MS,
            });
            processRateLimitHeaders(response.headers);
            if (isThrottleData(response.data) && attempt < retries) {
                await sleep(baseDelayMs * 2 ** attempt);
                continue;
            }
            return response.data;
        } catch (err) {
            processRateLimitHeaders(err.response?.headers);
            if (isThrottleError(err) && attempt < retries) {
                const retryAfter = Number(err.response?.headers?.['retry-after']);
                const wait = Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : baseDelayMs * 2 ** attempt;
                await sleep(wait);
                continue;
            }
            throw err;
        }
    }
};
