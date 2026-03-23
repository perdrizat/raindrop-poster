import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import imageRoutes from './image.js';

vi.mock('axios');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/imgbb', imageRoutes);

describe('ImgBB Upload Route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.IMGBB_API_KEY = 'test-key';
    });

    it('should successfully proxy base64 image securely to ImgBB and return url', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                data: { url: 'https://i.ibb.co/test/image.png' }
            }
        });

        const res = await request(app)
            .post('/api/imgbb/upload')
            .send({ image: 'base64stringdata' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, url: 'https://i.ibb.co/test/image.png' });
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('https://api.imgbb.com/1/upload'),
            expect.any(URLSearchParams),
            expect.any(Object)
        );
    });

    it('should return 400 if image string is missing', async () => {
        const res = await request(app)
            .post('/api/imgbb/upload')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Image data is required');
    });

    it('should accept large base64 image payloads (up to 10mb)', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                data: { url: 'https://i.ibb.co/test/large.png' }
            }
        });

        // Generate a ~2MB base64 string (simulates a typical image paste)
        const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);

        const res = await request(app)
            .post('/api/imgbb/upload')
            .send({ image: largeBase64 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, url: 'https://i.ibb.co/test/large.png' });
    });

    it('should return 500 when imgbb responds with an error', async () => {
        axios.post.mockRejectedValueOnce({
            response: {
                data: { error: { message: 'Invalid API key' } }
            }
        });

        const res = await request(app)
            .post('/api/imgbb/upload')
            .send({ image: 'base64stringdata' });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to upload image to ImgBB');
    });
});
