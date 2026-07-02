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
        getConfig: vi.fn().mockImplementation(async (k) => process.env[k] || mockDb[k]),
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
        await setSetting('BUFFER_CHANNELS', '');
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
        // 1 GetChannels + 2 createPost
        expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('reuses stored Buffer channel services and skips the extra GetChannels call', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';
        const { setSetting } = await import('../services/db.js');
        await setSetting('BUFFER_CHANNELS', JSON.stringify([
            { id: 'colombia', service: 'twitter', name: 'CO' },
            { id: 'argentina', service: 'bluesky', name: 'AR' },
        ]));

        axios.post.mockResolvedValue({
            data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'p1' } } } }
        });

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'short',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['colombia', 'argentina']
            });

        expect(response.status).toBe(200);
        // No GetChannels lookup — only the 2 createPost calls.
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

        // Buffer post should use the R2 URL (calls[0] is GetChannels, calls[1] is createPost)
        const bufferCall = axios.post.mock.calls[1][1];
        expect(bufferCall.variables.input.assets).toEqual([
            { image: { url: 'https://r2.dev/screenshots/test.png' } }
        ]);
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
        // Buffer post should use the cover URL directly (calls[0] is GetChannels, calls[1] is createPost)
        const bufferCall = axios.post.mock.calls[1][1];
        expect(bufferCall.variables.input.assets).toEqual([
            { image: { url: 'https://example.com/cover.jpg' } }
        ]);
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
        // calls[0] is GetChannels, calls[1] is createPost
        const callArgs = axios.post.mock.calls[1][1];
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

        const input = axios.post.mock.calls[1][1].variables.input;
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

        const input = axios.post.mock.calls[1][1].variables.input;
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

        const input = axios.post.mock.calls[1][1].variables.input;
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
            // call 1 = GetChannels, call 2 = first createPost (success), call 3 = second createPost (fail)
            if (callCount === 2) {
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

    it('should include error message from axios exception in response', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        // GetChannels succeeds, createPost throws
        axios.post
            .mockResolvedValueOnce({ data: { data: { channels: [{ id: 'ch1', service: 'twitter', name: 'x' }] } } })
            .mockRejectedValue(new Error('Request failed with status code 400'));

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'Exception test', targetChannels: ['ch1'] });

        expect(response.status).toBe(502);
        expect(response.body.error).toMatch(/Request failed with status code 400/);
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

    it('should reject with 400 when text exceeds Bluesky 300-char limit (no URL)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        // GetChannels query returns a bluesky channel
        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [{ id: 'bsky-1', service: 'bluesky', name: 'handle' }] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'A'.repeat(301), targetChannels: ['bsky-1'] });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Bluesky.*300/i);
        // Should NOT have called createPost
        expect(axios.post).toHaveBeenCalledTimes(1); // only GetChannels
    });

    it('should reject with 400 when Twitter effective length (URL as 23 chars) exceeds 280', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [{ id: 'tw-1', service: 'twitter', name: 'handle' }] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        // 256 + "\n\n" (2) + URL-as-23 = 281 > 280
        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'A'.repeat(256) + '\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['tw-1'],
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Twitter.*280/i);
    });

    it('should accept Twitter post at exactly 280 effective chars (URL as 23)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: {
                channels: [{ id: 'tw-1', service: 'twitter', name: 'handle' }],
                createPost: { __typename: 'PostActionSuccess', post: { id: 'post-1' } },
            } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        // 255 + 2 + 23 = 280 exactly
        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'A'.repeat(255) + '\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['tw-1'],
            });

        expect(response.status).toBe(200);
    });

    it('should count Threads text at full length (no URL shortening)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [{ id: 'th-1', service: 'threads', name: 'handle' }] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        // 480 + 2 + 27 (full URL) = 509 > 500
        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'A'.repeat(480) + '\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['th-1'],
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Threads.*500/i);
    });

    it('should reject with 400 when text exceeds Mastodon 500-char limit', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [{ id: 'masto-1', service: 'mastodon', name: 'instance' }] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'A'.repeat(501), targetChannels: ['masto-1'] });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Mastodon.*500/i);
    });

    it('should reject when ANY target channel would exceed its limit', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        // Two channels: linkedin (no limit) and bluesky (300 limit)
        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [
                { id: 'li-1', service: 'linkedin', name: 'profile' },
                { id: 'bsky-1', service: 'bluesky', name: 'handle' },
            ] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ text: 'A'.repeat(301), targetChannels: ['li-1', 'bsky-1'] });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Bluesky.*300/i);
        // Should NOT have posted to any channel
        expect(axios.post).toHaveBeenCalledTimes(1); // only GetChannels
    });

    it('should count articleUrl as exactly 23 chars for Bluesky (boundary: 275 + 2 + 23 = 300)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: {
                channels: [{ id: 'bsky-1', service: 'bluesky', name: 'handle' }],
                createPost: { __typename: 'PostActionSuccess', post: { id: 'post-1' } },
            } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        // 275 post + "\n\n" (2) + URL-as-23 = 300 exactly → allowed
        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'A'.repeat(275) + '\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['bsky-1'],
            });

        expect(response.status).toBe(200);
    });

    it('should reject Bluesky at 276 + separator + URL-as-23 = 301', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [{ id: 'bsky-1', service: 'bluesky', name: 'handle' }] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'A'.repeat(276) + '\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['bsky-1'],
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Bluesky.*300/i);
    });

    it('should count articleUrl as 23 chars for Mastodon too', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementationOnce(() =>
            Promise.resolve({ data: { data: { channels: [{ id: 'masto-1', service: 'mastodon', name: 'instance' }] } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        // 480 + 2 + URL-as-23 = 505 > 500
        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'A'.repeat(480) + '\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['masto-1'],
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/Mastodon.*500/i);
    });

    it('should send Bluesky post text as-is (URL included, no linkAttachment)', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: {
                channels: [{ id: 'bsky-1', service: 'bluesky', name: 'handle' }],
                createPost: { __typename: 'PostActionSuccess', post: { id: 'post-1' } },
            } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Great article about testing\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['bsky-1'],
            });

        // The createPost call should send the text verbatim; Bluesky's facet system
        // counts the URL as 23 chars regardless of actual length.
        const createPostCall = axios.post.mock.calls[1];
        const input = createPostCall[1].variables.input;
        expect(input.text).toBe('Great article about testing\n\nhttps://example.com/article');
        expect(input.metadata).toBeUndefined();
    });

    it('should NOT strip URL from non-Bluesky channel text', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        axios.post.mockImplementation(() =>
            Promise.resolve({ data: { data: {
                channels: [{ id: 'li-1', service: 'linkedin', name: 'profile' }],
                createPost: { __typename: 'PostActionSuccess', post: { id: 'post-1' } },
            } } })
        );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Great article\n\nhttps://example.com/article',
                articleUrl: 'https://example.com/article',
                targetChannels: ['li-1'],
            });

        const createPostCall = axios.post.mock.calls[1];
        const input = createPostCall[1].variables.input;
        expect(input.text).toBe('Great article\n\nhttps://example.com/article');
        expect(input.metadata).toBeUndefined();
    });

    it('should return partial failure warnings in response when some channels fail', async () => {
        process.env.BUFFER_ACCESS_TOKEN = 'mock-buffer-token';
        process.env.BUFFER_PROFILE_ID = 'mock-profile-id';

        // First call: GetChannels
        // Second call: channel 1 succeeds
        // Third call: channel 2 fails
        axios.post
            .mockImplementationOnce(() =>
                Promise.resolve({ data: { data: { channels: [
                    { id: 'li-1', service: 'linkedin', name: 'profile' },
                    { id: 'bsky-1', service: 'bluesky', name: 'handle' },
                ] } } })
            )
            .mockImplementationOnce(() =>
                Promise.resolve({ data: { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'post-1' } } } } })
            )
            .mockImplementationOnce(() =>
                Promise.resolve({ data: { data: { createPost: { __typename: 'InvalidInputError', message: 'Bluesky posts cannot exceed 300 characters.' } } } })
            );

        const testApp = express();
        testApp.use(express.json());
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({
                text: 'Test post',
                articleUrl: 'https://example.com',
                targetChannels: ['li-1', 'bsky-1'],
            });

        // Should still succeed (partial) but include warnings
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.partialErrors).toBeDefined();
        expect(response.body.partialErrors).toHaveLength(1);
        expect(response.body.partialErrors[0]).toMatch(/Bluesky/i);
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

        const input = axios.post.mock.calls[1][1].variables.input;
        expect(input.schedulingType).toBe('automatic');
        expect(input.mode).toBe('addToQueue');
        expect(input.saveToDraft).toBe(true);
    });
});
