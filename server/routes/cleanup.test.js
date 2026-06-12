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

    it('should run cleanup when due and Buffer token is available', async () => {
        shouldRunCleanup.mockResolvedValueOnce(true);
        process.env.BUFFER_ACCESS_TOKEN = 'mock-token';
        runCleanup.mockResolvedValueOnce({ checked: 3, cleaned: 2 });

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(200);
        expect(res.body.result).toEqual({ checked: 3, cleaned: 2 });
        expect(runCleanup).toHaveBeenCalledWith('mock-token');
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

    it('should handle cleanup errors gracefully', async () => {
        shouldRunCleanup.mockResolvedValueOnce(true);
        process.env.BUFFER_ACCESS_TOKEN = 'mock-token';
        runCleanup.mockRejectedValueOnce(new Error('Cleanup boom'));

        const app = express();
        app.use('/api/cleanup', cleanupRoutes);

        const res = await request(app).get('/api/cleanup/trigger');
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/cleanup failed/i);
    });
});
