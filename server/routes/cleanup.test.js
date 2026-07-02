import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/db.js', () => {
    let mockDb = {};
    return {
        getSetting: vi.fn().mockImplementation(async (k) => mockDb[k]),
        getConfig: vi.fn().mockImplementation(async (k) => process.env[k] || mockDb[k]),
        setSetting: vi.fn().mockImplementation(async (k, v) => { mockDb[k] = v; }),
    };
});

vi.mock('../services/cleanupService.js', () => ({
    shouldRunCleanup: vi.fn(),
    runCleanup: vi.fn(),
}));

import cleanupRoutes from './cleanup.js';
import { getConfig } from '../services/db.js';
import { shouldRunCleanup, runCleanup } from '../services/cleanupService.js';

describe('GET /api/cleanup/trigger', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.BUFFER_ACCESS_TOKEN;
    });

    it('should skip cleanup when not due', async () => {
        shouldRunCleanup.mockResolvedValueOnce(false);

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(200);
        expect(res.body.skipped).toBe(true);
        expect(runCleanup).not.toHaveBeenCalled();
    });

    it('responds immediately (fire-and-forget) and runs cleanup in the background', async () => {
        shouldRunCleanup.mockResolvedValueOnce(true);
        process.env.BUFFER_ACCESS_TOKEN = 'mock-token';
        // Never-resolving cleanup: if the route awaited it, this request would hang
        // and the test would time out — proving the endpoint no longer blocks.
        let resolveCleanup;
        runCleanup.mockReturnValueOnce(new Promise((resolve) => { resolveCleanup = resolve; }));

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ started: true });
        expect(runCleanup).toHaveBeenCalledWith('mock-token');
        resolveCleanup?.({ checked: 3, cleaned: 2 });
    });

    it('should use DB token when env token is not set', async () => {
        shouldRunCleanup.mockResolvedValueOnce(true);
        getConfig.mockResolvedValueOnce('db-token');
        runCleanup.mockResolvedValueOnce({ checked: 0, cleaned: 0 });

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(200);
        expect(runCleanup).toHaveBeenCalledWith('db-token');
    });

    it('should skip cleanup when no Buffer token is available', async () => {
        shouldRunCleanup.mockResolvedValueOnce(true);
        getConfig.mockResolvedValueOnce(null);

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(200);
        expect(res.body.skipped).toBe(true);
        expect(runCleanup).not.toHaveBeenCalled();
    });

    it('does not fail the response when background cleanup errors', async () => {
        shouldRunCleanup.mockResolvedValueOnce(true);
        process.env.BUFFER_ACCESS_TOKEN = 'mock-token';
        runCleanup.mockRejectedValueOnce(new Error('Cleanup boom'));

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        // The background failure is logged, not surfaced — the request still succeeds.
        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ started: true });
    });
});
