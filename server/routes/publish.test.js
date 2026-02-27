import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import publishRoutes from './publish';
import axios from 'axios';

vi.mock('axios');

vi.mock('twitter-api-v2', () => {
    return {
        TwitterApi: class {
            constructor() {
                this.v2 = {
                    tweet: vi.fn().mockResolvedValue({ data: { id: 'mock-tweet-id' } }),
                    me: vi.fn().mockResolvedValue({ data: { username: 'mockuser' } })
                };
            }
        }
    };
});

// Setup basic express app for testing router
const app = express();
app.use(express.json());

// Mock session middleware to inject user tokens during tests
app.use((req, res, next) => {
    req.session = {};
    next();
});

describe('POST /api/publish', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.BUFFER_ACCESS_TOKEN;
        delete process.env.BUFFER_PROFILE_ID;
    });

    it('should fail if user is not authenticated with Twitter', async () => {
        // App without populated session
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, res, next) => {
            req.session = {};
            next();
        });
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ tweet1: 'T1', tweet2: 'T2' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/Twitter connection required/i);
    });

    it('should call Twitter API to publish thread and return success', async () => {
        // App WITH populated session
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, res, next) => {
            req.session = {
                twitter: {
                    accessToken: 'mock-access',
                    accessSecret: 'mock-secret'
                }
            };
            next();
        });
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ tweet1: 'Test Tweet 1', tweet2: 'Test Tweet 2' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.url).toBeDefined();
    });

    it('should fail if destination is buffer but credentials are not set', async () => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ tweet1: 'T1', tweet2: 'T2', destination: 'buffer' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/Buffer credentials not configured/i);
    });

    it('should iterate over targetChannels and execute createPost for each tweet per channel', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation((url, data) => {
            if (data.query.includes('CreatePost')) {
                return Promise.resolve({ data: { data: { createPost: { post: { id: `mock-post-id-${Date.now()}` } } } } });
            }
            return Promise.resolve({ data: {} });
        });

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                tweet1: 'Test Tweet 1',
                tweet2: 'Test Tweet 2',
                destination: 'buffer',
                targetChannels: ['colombia', 'argentina']
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.url).toMatch(/buffer\.com/i);
        expect(response.body.message).toMatch(/Published to 2 channel\(s\)/i);

        // 2 tweets * 2 channels = 4 calls total. 
        expect(axios.post).toHaveBeenCalledTimes(4);

        // Assert Channel 1, Tweet 1
        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                query: expect.stringContaining('mutation CreatePost'),
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'colombia',
                        text: 'Test Tweet 1',
                        schedulingType: 'automatic',
                        mode: 'shareNext'
                    })
                })
            }),
            expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
        );

        // Assert Channel 1, Tweet 2
        expect(axios.post).toHaveBeenNthCalledWith(
            2,
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'colombia',
                        text: 'Test Tweet 2'
                    })
                })
            }),
            expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
        );

        // Assert Channel 2, Tweet 1
        expect(axios.post).toHaveBeenNthCalledWith(
            3,
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'argentina',
                        text: 'Test Tweet 1'
                    })
                })
            }),
            expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
        );

        // Assert Channel 2, Tweet 2
        expect(axios.post).toHaveBeenNthCalledWith(
            4,
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'argentina',
                        text: 'Test Tweet 2'
                    })
                })
            }),
            expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
        );
    });
});
