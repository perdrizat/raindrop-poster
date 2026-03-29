import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import publishRoutes from './publish';
import axios from 'axios';

vi.mock('axios');
vi.mock('../services/db.js', () => {
    let mockDb = {};
    return {
        getSetting: vi.fn().mockImplementation(async (k) => mockDb[k]),
        setSetting: vi.fn().mockImplementation(async (k, v) => { mockDb[k] = v; }),
        trackPostImage: vi.fn().mockResolvedValue({}),
    };
});
vi.mock('../services/imageHostService.js', () => ({
    uploadImage: vi.fn().mockResolvedValue({ url: 'https://r2.dev/screenshots/test.png', key: 'screenshots/test.png' }),
}));

import { trackPostImage } from '../services/db.js';
import { uploadImage } from '../services/imageHostService.js';

describe('POST /api/publish', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.BUFFER_ACCESS_TOKEN;
        delete process.env.BUFFER_PROFILE_ID;
        const { setSetting } = await import('../services/db.js');
        await setSetting('BUFFER_ACCESS_TOKEN', '');
        await setSetting('BUFFER_PROFILE_ID', '');
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
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'mock-post-id' } } } } })
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
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('should upload imageData to R2 before posting to Buffer', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'mock-post-id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json({ limit: '10mb' }));
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Test with image',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['channel1'],
                imageData: 'data:image/png;base64,iVBORw0KGgo='
            });

        expect(response.status).toBe(200);
        // Should have uploaded to R2
        expect(uploadImage).toHaveBeenCalledTimes(1);
        expect(uploadImage).toHaveBeenCalledWith(expect.any(Buffer));

        // Buffer post should use the R2 URL
        const bufferCall = axios.post.mock.calls[0][1];
        expect(bufferCall.variables.input.assets).toEqual({
            images: [{ url: 'https://r2.dev/screenshots/test.png' }]
        });
    });

    it('should track post image in DB after successful Buffer post', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'post-123' } } } } })
        );

        const testApp = express();
        testApp.use(express.json({ limit: '10mb' }));
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Track test',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['ch1'],
                imageData: 'data:image/png;base64,iVBORw0KGgo='
            });

        expect(response.status).toBe(200);
        expect(trackPostImage).toHaveBeenCalledWith('post-123', 'screenshots/test.png', 'ch1');
    });

    it('should pass coverUrl directly to Buffer without uploading to R2', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'mock-post-id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Test with cover',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['channel1'],
                coverUrl: 'https://example.com/cover.jpg'
            });

        expect(response.status).toBe(200);
        // Should NOT have uploaded to R2
        expect(uploadImage).not.toHaveBeenCalled();
        // Buffer post should use the cover URL directly
        const bufferCall = axios.post.mock.calls[0][1];
        expect(bufferCall.variables.input.assets).toEqual({
            images: [{ url: 'https://example.com/cover.jpg' }]
        });
        // Should NOT track (no R2 key to clean up)
        expect(trackPostImage).not.toHaveBeenCalled();
    });

    it('should NOT include assets when no image is provided', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'mock-post-id' } } } } })
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
        const callArgs = axios.post.mock.calls[0][1];
        expect(callArgs.variables.input.assets).toBeUndefined();
        expect(uploadImage).not.toHaveBeenCalled();
    });

    // --- Buffer scheduling mode tests ---

    it('should send mode=shareNow for "Now"', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        await request(testApp).post('/api/publish').send({
            text: 'Now', destination: 'buffer', bufferMode: 'now', targetChannels: ['ch1']
        });

        const input = axios.post.mock.calls[0][1].variables.input;
        expect(input.schedulingType).toBe('automatic');
        expect(input.mode).toBe('shareNow');
        expect(input.saveToDraft).toBeUndefined();
    });

    it('should send mode=shareNext for "Prioritize"', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        await request(testApp).post('/api/publish').send({
            text: 'Pri', destination: 'buffer', bufferMode: 'prioritize', targetChannels: ['ch1']
        });

        const input = axios.post.mock.calls[0][1].variables.input;
        expect(input.schedulingType).toBe('automatic');
        expect(input.mode).toBe('shareNext');
        expect(input.saveToDraft).toBeUndefined();
    });

    it('should send mode=addToQueue for "Next Available"', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        await request(testApp).post('/api/publish').send({
            text: 'Next', destination: 'buffer', bufferMode: 'next', targetChannels: ['ch1']
        });

        const input = axios.post.mock.calls[0][1].variables.input;
        expect(input.schedulingType).toBe('automatic');
        expect(input.mode).toBe('addToQueue');
        expect(input.saveToDraft).toBeUndefined();
    });

    it('should fail with 400 if targetChannels is missing', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Test', destination: 'buffer' });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/No target channels/i);
    });

    it('should fail with 400 if targetChannels is empty array', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Test', destination: 'buffer', targetChannels: [] });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/No target channels/i);
    });

    it('should return 502 when all channels fail with GraphQL errors', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { errors: [{ message: 'Unauthorized' }] } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Fail test', targetChannels: ['ch1', 'ch2'] });

        expect(response.status).toBe(502);
        expect(response.body.error).toMatch(/Failed to publish.*Unauthorized/);
    });

    it('should return 502 when all channels return InvalidInputError', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'InvalidInputError', message: 'Text too long' } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Too long', targetChannels: ['ch1'] });

        expect(response.status).toBe(502);
        expect(response.body.error).toMatch(/Text too long/);
    });

    it('should succeed with partial failures (some channels succeed, some fail)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        let callCount = 0;
        axios.post.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'ok-post' } } } } });
            }
            return Promise.resolve({ data: { data: { createPost: { __typename: 'UnexpectedError', message: 'Server error' } } } });
        });

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Partial', targetChannels: ['ch1', 'ch2'] });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toMatch(/Published to 1 channel/);
        expect(response.body.postedIds).toEqual(['ok-post']);
    });

    it('should handle channel-level axios exception gracefully', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockRejectedValue(new Error('ECONNRESET'));

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Exception test', targetChannels: ['ch1'] });

        expect(response.status).toBe(502);
        expect(response.body.error).toMatch(/Failed to publish/);
    });

    it('should count success when createPost returns unknown typename (no post ID)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'SomeNewType' } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Unknown type', targetChannels: ['ch1'] });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    it('should send saveToDraft=true with mode=addToQueue for "Drafts"', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'id' } } } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        await request(testApp).post('/api/publish').send({
            text: 'Draft', destination: 'buffer', bufferMode: 'draft', targetChannels: ['ch1']
        });

        const input = axios.post.mock.calls[0][1].variables.input;
        expect(input.schedulingType).toBe('automatic');
        expect(input.mode).toBe('addToQueue');
        expect(input.saveToDraft).toBe(true);
    });
});
