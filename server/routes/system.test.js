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

        it('matches the shared systemStatus contract shape (client tests mock this exact shape)', async () => {
            const { systemStatusContract, keysOf } = await import('../../fixtures/apiContracts.js');
            const res = await request(app).get('/api/system/status');
            expect(res.statusCode).toBe(200);
            expect(keysOf(res.body)).toEqual(keysOf(systemStatusContract));
        });

        it('should return configured status when required keys exist in DB', async () => {
            await setSetting('RAINDROPIO_CLIENT_ID', 'test_id');
            // Assuming we require at least these two for minimum config

            const res = await request(app).get('/api/system/status');
            expect(res.statusCode).toBe(200);
            expect(res.body.isConfigured).toBe(true);
            expect(res.body.hasRaindropConfig).toBe(true);
        });

        it('should report hasVeniceConfig when VENICE_API_KEY is set', async () => {
            await setSetting('VENICE_API_KEY', 'venice_test_key');
            const res = await request(app).get('/api/system/status');
            expect(res.body.hasVeniceConfig).toBe(true);
        });

        it('should report hasBufferConfig when BUFFER_ACCESS_TOKEN is set', async () => {
            await setSetting('BUFFER_ACCESS_TOKEN', 'buf_test_token');
            const res = await request(app).get('/api/system/status');
            expect(res.body.hasBufferConfig).toBe(true);
        });

        it('should report hasR2Config when R2_ACCOUNT_ID is set', async () => {
            await setSetting('R2_ACCOUNT_ID', 'r2_test_id');
            const res = await request(app).get('/api/system/status');
            expect(res.body.hasR2Config).toBe(true);
        });

        it('should return selectedTag and postingObjectives from DB', async () => {
            await setSetting('SELECTED_TAG', 'fintech');
            await setSetting('POSTING_OBJECTIVES', 'Engage audience with insights');
            const res = await request(app).get('/api/system/status');
            expect(res.body.selectedTag).toBe('fintech');
            expect(res.body.postingObjectives).toBe('Engage audience with insights');
        });

        it('should return parsed bufferChannels array from DB', async () => {
            await setSetting('BUFFER_CHANNELS', JSON.stringify([{ id: 'ch1', name: 'Twitter' }]));
            const res = await request(app).get('/api/system/status');
            expect(res.body.bufferChannels).toEqual([{ id: 'ch1', name: 'Twitter' }]);
        });

        it('should return empty bufferChannels when not set', async () => {
            const res = await request(app).get('/api/system/status');
            expect(res.body.bufferChannels).toEqual([]);
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

        it('should save R2 config fields and reflect in status', async () => {
            const res = await request(app)
                .post('/api/system/configure')
                .send({
                    r2AccountId: 'acct123',
                    r2AccessKeyId: 'key123',
                    r2SecretAccessKey: 'secret123',
                    r2BucketName: 'my-bucket',
                    r2PublicUrl: 'https://pub.r2.dev'
                });

            expect(res.statusCode).toBe(200);
            expect(process.env.R2_ACCOUNT_ID).toBe('acct123');

            const statusRes = await request(app).get('/api/system/status');
            expect(statusRes.body.hasR2Config).toBe(true);
        });

        it('should persist selectedTag and postingObjectives', async () => {
            await request(app)
                .post('/api/system/configure')
                .send({
                    selectedTag: 'crypto',
                    postingObjectives: 'Weekly insights'
                });

            const statusRes = await request(app).get('/api/system/status');
            expect(statusRes.body.selectedTag).toBe('crypto');
            expect(statusRes.body.postingObjectives).toBe('Weekly insights');
        });

        it('should allow clearing selectedTag to empty string', async () => {
            await setSetting('SELECTED_TAG', 'old-tag');
            await request(app)
                .post('/api/system/configure')
                .send({ selectedTag: '' });

            const statusRes = await request(app).get('/api/system/status');
            expect(statusRes.body.selectedTag).toBe('');
        });

        it('should persist bufferChannels as JSON array', async () => {
            const channels = [{ id: 'ch1', name: 'LinkedIn' }, { id: 'ch2', name: 'Twitter' }];
            await request(app)
                .post('/api/system/configure')
                .send({ bufferChannels: channels });

            const statusRes = await request(app).get('/api/system/status');
            expect(statusRes.body.bufferChannels).toEqual(channels);
        });

        it('should skip empty string config values (not overwrite existing)', async () => {
            await setSetting('VENICE_API_KEY', 'existing_key');
            process.env.VENICE_API_KEY = 'existing_key';

            await request(app)
                .post('/api/system/configure')
                .send({ veniceApiKey: '  ' }); // whitespace-only

            // Should still have the old key
            const statusRes = await request(app).get('/api/system/status');
            expect(statusRes.body.hasVeniceConfig).toBe(true);
        });
    });
});
