import React, { useState, useEffect } from 'react';
import { getBufferQuota } from '../services/systemService';

const POLL_MS = 60000;      // re-fetch the cached snapshot (no Buffer quota consumed)
const TICK_MS = 30000;      // refresh the "resets in" countdown
const THRESHOLD = 0.8;      // show only at 80%+ usage

const formatDuration = (ms) => {
    if (ms <= 0) return 'shortly';
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
};

// Persistent amber banner shown whenever Buffer API usage is at/above 80% of its
// limit. Below 80% it renders nothing. When fully blocked it leads with the reset time.
const BufferQuotaBanner = () => {
    const [rateLimit, setRateLimit] = useState(null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await getBufferQuota();
                if (!cancelled) setRateLimit(data.rateLimit);
            } catch {
                /* ignore — the banner simply won't show */
            }
        };
        load();
        const poll = setInterval(load, POLL_MS);
        const tick = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => { cancelled = true; clearInterval(poll); clearInterval(tick); };
    }, []);

    if (!rateLimit || !rateLimit.limit) return null;

    // Once the window has reset, the snapshot is stale — assume quota replenished.
    const expired = rateLimit.resetAt && now > rateLimit.resetAt;
    const used = (rateLimit.limit - rateLimit.remaining) / rateLimit.limit;
    if (expired || used < THRESHOLD) return null;

    const resetIn = rateLimit.resetAt ? formatDuration(rateLimit.resetAt - now) : null;
    const blocked = rateLimit.remaining <= 0;

    const message = blocked
        ? `Buffer daily API limit reached — publishing is paused. ${resetIn ? `Resets in ${resetIn}.` : 'Please try again later.'}`
        : `Buffer API quota low: ${rateLimit.remaining} of ${rateLimit.limit} calls left${resetIn ? ` — resets in ${resetIn}` : ''}.`;

    return (
        <div
            role="alert"
            data-testid="buffer-quota-banner"
            className="w-full bg-amber-100 dark:bg-amber-900/80 border-b border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 text-sm text-center py-2 px-4"
        >
            <span className="font-bold mr-1" aria-hidden="true">~</span>{message}
        </div>
    );
};

export default BufferQuotaBanner;
