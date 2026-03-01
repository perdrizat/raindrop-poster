import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import authRoutes from './auth.js';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';

// 1. Mock the external modules
vi.mock('axios');
vi.mock('twitter-api-v2', () => {
    return {
        TwitterApi: class {
            constructor() {
                this.v2 = {
                    me: vi.fn().mockResolvedValue({
                        data: {
                            username: 'testuser',
                            name: 'Test User'
                        }
                    })
                };
            }
            generateOAuth2AuthLink() {
                return {
                    url: 'https://twitter.com/oauth',
                    codeVerifier: 'mocked-verifier',
                    state: 'mocked-state'
                };
            }
            async loginWithOAuth2() {
                return {
                    client: {},
                    accessToken: 'tw_access',
                    refreshToken: 'tw_refresh',
                    expiresIn: 3600
                };
            }
        }
    };
});

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
    if (req.headers.authorization === 'Bearer mock-tw-token') {
        req.session.twitter = { accessToken: 'mock-tw-token' };
    }
    if (req.headers['x-mock-oauth-state']) {
        req.session.twitterState = 'mocked-state';
        req.session.twitterVerifier = 'mocked-verifier';
        req.session.raindropioState = 'mocked-state';
    }
    next();
});

app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Inject Mock Environment Variables
        process.env.RAINDROPIO_CLIENT_ID = 'rd_id';
        process.env.RAINDROPIO_CLIENT_SECRET = 'rd_secret';
        process.env.RAINDROPIO_REDIRECT_URI = 'http://localhost:3001/api/auth/raindropio/callback';

        process.env.VENICE_API_KEY = 'mock_venice_key';
        process.env.BUFFER_ACCESS_TOKEN = 'mock_buffer_token';
        process.env.BUFFER_PROFILE_ID = 'mock_buffer_profile';

        process.env.TWITTER_CLIENT_ID = 'tw_id';
        process.env.TWITTER_CLIENT_SECRET = 'tw_secret';
        process.env.TWITTER_REDIRECT_URI = 'http://localhost:3001/api/auth/twitter/callback';
    });

    describe('GET /api/auth/status', () => {
        it('should return all false for user sessions, but true for system venice key', async () => {
            const res = await request(app).get('/api/auth/status');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                twitter: false,
                raindropio: false,
                venice: true,
                buffer: true,
                imgbb: false,
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

        it('should redirect to Twitter OAuth portal via twitter-api-v2', async () => {
            const res = await request(app).get('/api/auth/twitter');
            expect(res.status).toBe(302);
            expect(res.headers.location).toBe('https://twitter.com/oauth');
        });

        it('should return 400 for an unknown provider', async () => {
            const res = await request(app).get('/api/auth/unknown');
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'Unknown OAuth provider' });
        });
    });

    describe('GET /api/auth/twitter/test', () => {
        it('should return 401 if user is not authenticated with Twitter', async () => {
            const res = await request(app).get('/api/auth/twitter/test');
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Not authenticated with Twitter' });
        });

        it('should return username and name if Twitter token is valid', async () => {
            const res = await request(app)
                .get('/api/auth/twitter/test')
                .set('Authorization', 'Bearer mock-tw-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, username: 'testuser', name: 'Test User' });
        });
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

    describe('ImgBB API key endpoints', () => {
        it('POST /api/auth/imgbb/key should save the API key', async () => {
            const res = await request(app)
                .post('/api/auth/imgbb/key')
                .send({ apiKey: 'test_imgbb_key' });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true });
            expect(process.env.IMGBB_API_KEY).toBe('test_imgbb_key');
        });

        it('POST /api/auth/imgbb/key should reject empty key', async () => {
            const res = await request(app)
                .post('/api/auth/imgbb/key')
                .send({ apiKey: '' });
            expect(res.status).toBe(400);
        });

        it('GET /api/auth/imgbb/test should return success when key is set', async () => {
            process.env.IMGBB_API_KEY = 'test_key';
            const res = await request(app).get('/api/auth/imgbb/test');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('GET /api/auth/imgbb/test should return 401 when key is missing', async () => {
            delete process.env.IMGBB_API_KEY;
            const res = await request(app).get('/api/auth/imgbb/test');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /api/auth/:provider/callback', () => {
        it('should handle successful Twitter callback', async () => {
            const res = await request(app)
                .get('/api/auth/twitter/callback?state=mocked-state&code=mocked-code')
                .set('x-mock-oauth-state', 'true');

            expect(res.status).toBe(302);
            expect(res.headers.location).toBe('http://localhost:5173/setup?success=twitter');
        });

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
