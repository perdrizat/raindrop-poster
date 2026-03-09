import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import systemRoutes from './system.js';
import { getDb, setSetting, closeDb } from '../services/db.js';
import fs from 'fs';
import path from 'path';

let app;

describe('System Configuration Endpoints', () => {
    const TEST_DB = path.join(process.cwd(), 'test-system.sqlite');

    beforeEach(async () => {
        await closeDb();
        if (fs.existsSync(TEST_DB)) {
            fs.unlinkSync(TEST_DB);
        }

        // Ensure Db points to our test isolated instance
        getDb(TEST_DB);

        // Clear process.env purely for the testing context
        process.env.RAINDROPIO_CLIENT_ID = '';

        app = express();
        app.use(express.json());
        app.use('/api/system', systemRoutes);
    });

    afterEach(async () => {
        try {
            await closeDb();
            if (fs.existsSync(TEST_DB)) {
                fs.unlinkSync(TEST_DB);
            }
        } catch (e) {
            // ignore
        }
    });

    describe('GET /api/system/status', () => {
        it('should return unconfigured status when DB is empty', async () => {
            const res = await request(app).get('/api/system/status');
            expect(res.statusCode).toBe(200);
            expect(res.body.isConfigured).toBe(false);
            expect(res.body.hasRaindropConfig).toBe(false);
        });

        it('should return configured status when required keys exist in DB', async () => {
            await setSetting('RAINDROPIO_CLIENT_ID', 'test_id');
            // Assuming we require at least these two for minimum config

            const res = await request(app).get('/api/system/status');
            expect(res.statusCode).toBe(200);
            expect(res.body.isConfigured).toBe(true);
            expect(res.body.hasRaindropConfig).toBe(true);
        });
    });

    describe('POST /api/system/configure', () => {
        it('should save configuration to the database and update process.env', async () => {
            const payload = {
                raindropClientId: 'new_rd_id',
                raindropClientSecret: 'new_rd_secret',
                veniceApiKey: 'new_venice_key'
            };

            const res = await request(app)
                .post('/api/system/configure')
                .send(payload);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify it was pushed to process.env immediately
            expect(process.env.RAINDROPIO_CLIENT_ID).toBe('new_rd_id');

            // Verify it persists in database
            const statusRes = await request(app).get('/api/system/status');
            expect(statusRes.body.hasRaindropConfig).toBe(true);
        });
    });
});
