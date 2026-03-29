import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import authRoutes from './auth.js';
import axios from 'axios';
import { setSetting } from '../services/db.js';

// 1. Mock the external modules
vi.mock('axios');
vi.mock('../services/db.js', () => {
    let mockDb = {};
    return {
        getSetting: vi.fn().mockImplementation(async (k) => mockDb[k]),
        setSetting: vi.fn().mockImplementation(async (k, v) => { mockDb[k] = v; }),
        _getMockDb: () => mockDb,
        _resetMockDb: () => { mockDb = {}; }
    };
});
vi.mock('../services/imageHostService.js', () => ({
    testConnection: vi.fn(),
}));

import { testConnection } from '../services/imageHostService.js';


// 2. Setup an isolated Express app for testing the router
const app = express();
app.use(express.json());
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true
}));

// Route protection mock middleware
app.use((req, res, next) => {
    if (req.headers['x-mock-oauth-state']) {
        req.session.raindropioState = 'mocked-state';
    }
    next();
});

app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
    beforeEach(async () => {
        vi.clearAllMocks();

        // Clear DB state that might leak from other suites
        await setSetting('BUFFER_ACCESS_TOKEN', '');
        await setSetting('VENICE_API_KEY', '');
        await setSetting('RAINDROPIO_ACCESS_TOKEN', '');
        await setSetting('R2_ACCOUNT_ID', '');

        // Inject Mock Environment Variables
        process.env.RAINDROPIO_CLIENT_ID = 'rd_id';
        process.env.RAINDROPIO_CLIENT_SECRET = 'rd_secret';
        process.env.RAINDROPIO_REDIRECT_URI = 'http://localhost:3001/api/auth/raindropio/callback';

        process.env.VENICE_API_KEY = 'mock_venice_key';
        process.env.BUFFER_ACCESS_TOKEN = 'mock_buffer_token';
        process.env.BUFFER_PROFILE_ID = 'mock_buffer_profile';
    });

    describe('GET /api/auth/status', () => {
        it('should return all false for user sessions, but true for system venice key', async () => {
            const res = await request(app).get('/api/auth/status');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                raindropio: false,
                venice: true,
                buffer: true,
                r2: false,
            });
        });
    });

    describe('GET /api/auth/:provider (Initialization)', () => {
        it('should redirect to Raindrop.io OAuth portal', async () => {
            const res = await request(app).get('/api/auth/raindropio');
            expect(res.status).toBe(302);
            expect(res.headers.location).toContain('https://raindrop.io/oauth/authorize');
            expect(res.headers.location).toContain('client_id=rd_id');
        });

    });

    it('should return 400 for an unknown provider', async () => {
        const res = await request(app).get('/api/auth/unknown');
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Unknown OAuth provider' });
    });


    describe('GET /api/auth/buffer/test', () => {
        it('should return 401 if Buffer token is not in environment', async () => {
            delete process.env.BUFFER_ACCESS_TOKEN;
            const res = await request(app).get('/api/auth/buffer/test');
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Not authenticated with Buffer' });
        });

        it('should return channel details if Buffer token is valid', async () => {
            axios.post.mockResolvedValueOnce({
                data: {
                    data: {
                        channels: [
                            { id: 'profile1', service: 'twitter', name: '@mockUser' },
                            { id: 'profile2', service: 'linkedin', name: 'Mock User' }
                        ]
                    }
                }
            });

            const res = await request(app).get('/api/auth/buffer/test');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                channels: [
                    { id: 'profile1', service: 'twitter', name: '@mockUser' },
                    { id: 'profile2', service: 'linkedin', name: 'Mock User' }
                ],
                channelCount: 2,
                services: 'twitter, linkedin',
            });
            expect(axios.post).toHaveBeenCalledWith('https://api.buffer.com/1/graphql', expect.objectContaining({
                query: expect.stringContaining('query GetChannels')
            }), {
                headers: {
                    Authorization: 'Bearer mock_buffer_token',
                    'Content-Type': 'application/json'
                }
            });
        });
    });

    describe('Cloudflare R2 test endpoint', () => {
        it('GET /api/auth/r2/test should return success when R2 is configured', async () => {
            testConnection.mockResolvedValueOnce({ success: true, message: 'Connected to R2 bucket "my-bucket"' });

            const res = await request(app).get('/api/auth/r2/test');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Connected');
        });

        it('GET /api/auth/r2/test should return 502 when R2 is not configured', async () => {
            testConnection.mockRejectedValueOnce(new Error('Cloudflare R2 is not configured'));

            const res = await request(app).get('/api/auth/r2/test');
            expect(res.status).toBe(502);
            expect(res.body.error).toContain('R2');
        });
    });

    describe('GET /api/auth/:provider/callback', () => {

        it('should handle successful Raindrop.io callback', async () => {
            axios.post.mockResolvedValueOnce({
                data: {
                    access_token: 'rd_access_mock',
                    refresh_token: 'rd_refresh_mock',
                    expires_in: 3600
                }
            });

            const res = await request(app)
                .get('/api/auth/raindropio/callback?state=mocked-state&code=mocked-code')
                .set('x-mock-oauth-state', 'true');

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe('http://localhost:5173/setup?success=raindropio');
            expect(axios.post).toHaveBeenCalledWith('https://raindrop.io/oauth/access_token', {
                client_id: 'rd_id',
                client_secret: 'rd_secret',
                grant_type: 'authorization_code',
                code: 'mocked-code',
                redirect_uri: 'http://localhost:3001/api/auth/raindropio/callback'
            });
        });

        it('should handle Raindrop.io callback with 200 OK error payload', async () => {
            axios.post.mockResolvedValueOnce({
                data: {
                    result: false,
                    status: 400,
                    errorMessage: 'Incorrect redirect_uri'
                }
            });

            const res = await request(app)
                .get('/api/auth/raindropio/callback?state=mocked-state&code=mocked-code')
                .set('x-mock-oauth-state', 'true');

            expect(res.status).toBe(401);
            expect(res.text).toContain('Raindrop OAuth failed with payload');
        });

        it('should return 400 for an unknown provider in callback', async () => {
            const res = await request(app)
                .get('/api/auth/unknown/callback?state=mocked-state&code=mocked-code')
                .set('x-mock-oauth-state', 'true');

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'Unknown callback provider' });
        });
    });
});
