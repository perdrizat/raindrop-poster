import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/screenshotService.js', () => ({
    captureQuoteScreenshot: vi.fn(),
}));

vi.mock('../services/imageHostService.js', () => ({
    uploadImage: vi.fn(),
}));

import screenshotRoutes from './screenshot.js';
import { captureQuoteScreenshot } from '../services/screenshotService.js';
import { uploadImage } from '../services/imageHostService.js';

const app = express();
app.use(express.json());
app.use('/api/screenshot', screenshotRoutes);

describe('POST /api/screenshot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 400 if url is missing', async () => {
        const res = await request(app)
            .post('/api/screenshot')
            .send({ quoteText: 'Some quote' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/url is required/i);
    });

    it('should capture screenshot, upload, and return URL', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('fake-png'));
        uploadImage.mockResolvedValueOnce({ url: 'https://i.ibb.co/abc/shot.png' });

        const res = await request(app)
            .post('/api/screenshot')
            .send({
                url: 'https://example.com/article',
                quoteText: 'Important quote',
                author: 'Jane Smith',
                date: '2026-02-27',
            });

        expect(res.status).toBe(200);
        expect(res.body.screenshotUrl).toBe('https://i.ibb.co/abc/shot.png');
        expect(captureQuoteScreenshot).toHaveBeenCalledWith(
            'https://example.com/article',
            'Important quote',
            expect.objectContaining({ author: 'Jane Smith', domain: 'example.com' }),
            undefined
        );
    });

    it('should return cover URL directly when screenshot returns a string', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce('https://example.com/cover.jpg');

        const res = await request(app)
            .post('/api/screenshot')
            .send({
                url: 'https://example.com/article',
                quoteText: null,
                coverImageUrl: 'https://example.com/cover.jpg',
            });

        expect(res.status).toBe(200);
        expect(res.body.screenshotUrl).toBe('https://example.com/cover.jpg');
        // Should NOT have called uploadImage since it's already a URL
        expect(uploadImage).not.toHaveBeenCalled();
    });

    it('should handle screenshot service errors', async () => {
        captureQuoteScreenshot.mockRejectedValueOnce(new Error('Browser crash'));

        const res = await request(app)
            .post('/api/screenshot')
            .send({
                url: 'https://example.com/article',
                quoteText: 'Some quote',
            });

        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/failed to capture/i);
    });

    it('should handle upload errors', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('fake-png'));
        uploadImage.mockRejectedValueOnce(new Error('Upload failed'));

        const res = await request(app)
            .post('/api/screenshot')
            .send({
                url: 'https://example.com/article',
                quoteText: 'Some quote',
            });

        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/failed/i);
    });
});
