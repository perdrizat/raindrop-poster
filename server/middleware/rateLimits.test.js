import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { makeLimiter, expensiveRouteLimiter } from './rateLimits.js';

describe('rate limiting middleware', () => {
    it('returns 429 with the JSON error shape once the limit is exceeded', async () => {
        const app = express();
        app.use('/limited', makeLimiter({ windowMs: 60_000, max: 2 }), (req, res) => res.json({ ok: true }));

        await request(app).get('/limited').expect(200);
        await request(app).get('/limited').expect(200);
        const res = await request(app).get('/limited');

        expect(res.status).toBe(429);
        expect(res.body.error).toMatch(/too many requests/i);
    });

    it('expensiveRouteLimiter is skipped entirely under NODE_ENV=test', async () => {
        // vitest sets NODE_ENV=test — the production limiter must not throttle test suites
        const app = express();
        app.use('/expensive', expensiveRouteLimiter, (req, res) => res.json({ ok: true }));

        for (let i = 0; i < 40; i++) {
            const res = await request(app).get('/expensive');
            expect(res.status).toBe(200);
        }
    });
});
