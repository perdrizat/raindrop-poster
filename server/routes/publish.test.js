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

describe('POST /api/publish', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.BUFFER_ACCESS_TOKEN;
        delete process.env.BUFFER_PROFILE_ID;
    });

    it('should fail if text is missing', async () => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/text.*required/i);
    });

    // --- Twitter Tests ---
    it('should fail if user is not authenticated with Twitter', async () => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, res, next) => {
            req.session = {};
            next();
        });
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Hello world', articleUrl: 'https://example.com' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/Twitter connection required/i);
    });

    it('should publish a single tweet and return success', async () => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, res, next) => {
            req.session = {
                twitter: { accessToken: 'mock-access', accessSecret: 'mock-secret' }
            };
            next();
        });
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Test post', articleUrl: 'https://example.com' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.url).toBeDefined();
    });

    // --- Buffer Tests ---
    it('should fail if destination is buffer but credentials are not set', async () => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'T1', destination: 'buffer' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/Buffer credentials not configured/i);
    });

    it('should post single update to each Buffer channel', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { post: { id: 'mock-post-id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Test post',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['colombia', 'argentina']
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toMatch(/Published to 2 channel/i);

        // 1 post × 2 channels = 2 calls
        expect(axios.post).toHaveBeenCalledTimes(2);

        // Assert Channel 1
        expect(axios.post).toHaveBeenNthCalledWith(
            1,
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                query: expect.stringContaining('mutation CreatePost'),
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'colombia',
                        text: 'Test post',
                    })
                })
            }),
            expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
        );
    });

    it('should include assets.images in Buffer post when screenshotUrl is provided', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { post: { id: 'mock-post-id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Test with image',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['channel1'],
                screenshotUrl: 'https://i.ibb.co/abc/screenshot.png'
            });

        expect(response.status).toBe(200);

        // Verify the GraphQL call includes assets
        expect(axios.post).toHaveBeenCalledWith(
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'channel1',
                        text: 'Test with image',
                        assets: {
                            images: [{ url: 'https://i.ibb.co/abc/screenshot.png' }]
                        }
                    })
                })
            }),
            expect.anything()
        );
    });

    it('should NOT include assets when screenshotUrl is absent', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { post: { id: 'mock-post-id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Test no image',
                destination: 'buffer',
                targetChannels: ['channel1']
            });

        expect(response.status).toBe(200);

        // Verify no assets field
        const callArgs = axios.post.mock.calls[0][1];
        expect(callArgs.variables.input.assets).toBeUndefined();
    });

    it('should post correctly to Buffer Draft queue', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { post: { id: 'mock-draft-id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Draft test',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                bufferMode: 'draft',
                targetChannels: ['channel1']
            });

        expect(response.status).toBe(200);

        // Verify it sets shareNext and saveToDraft
        expect(axios.post).toHaveBeenCalledWith(
            'https://api.buffer.com/1/graphql',
            expect.objectContaining({
                variables: expect.objectContaining({
                    input: expect.objectContaining({
                        channelId: 'channel1',
                        saveToDraft: true,
                        mode: "shareNext"
                    })
                })
            }),
            expect.anything()
        );
    });
});
