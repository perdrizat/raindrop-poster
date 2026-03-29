import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/screenshotService.js', () => ({
    captureQuoteScreenshot: vi.fn(),
}));

import screenshotRoutes from './screenshot.js';
import { captureQuoteScreenshot } from '../services/screenshotService.js';

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

    it('should capture screenshot and return base64 data URL (no upload)', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('fake-png'));

        const res = await request(app)
            .post('/api/screenshot')
            .send({
                url: 'https://example.com/article',
                quoteText: 'Important quote',
                author: 'Jane Smith',
                date: '2026-02-27',
            });

        expect(res.status).toBe(200);
        // Should return a base64 data URL, not an uploaded URL
        expect(res.body.imageData).toMatch(/^data:image\/png;base64,/);
        expect(res.body.screenshotUrl).toBeUndefined();
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
        // Cover URLs are already public — return as coverUrl
        expect(res.body.coverUrl).toBe('https://example.com/cover.jpg');
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

    it('should extract domain from URL and strip www prefix', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('png'));

        await request(app)
            .post('/api/screenshot')
            .send({ url: 'https://www.reuters.com/article/123' });

        expect(captureQuoteScreenshot).toHaveBeenCalledWith(
            'https://www.reuters.com/article/123',
            null,
            expect.objectContaining({ domain: 'reuters.com' }),
            undefined
        );
    });

    it('should use explicit domain override when provided', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('png'));

        await request(app)
            .post('/api/screenshot')
            .send({ url: 'https://example.com/article', domain: 'custom-source.org' });

        expect(captureQuoteScreenshot).toHaveBeenCalledWith(
            'https://example.com/article',
            null,
            expect.objectContaining({ domain: 'custom-source.org' }),
            undefined
        );
    });

    it('should pass null for quoteText when not provided', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('png'));

        await request(app)
            .post('/api/screenshot')
            .send({ url: 'https://example.com' });

        expect(captureQuoteScreenshot).toHaveBeenCalledWith(
            'https://example.com',
            null,
            expect.objectContaining({ author: null, date: null }),
            undefined
        );
    });

    it('should pass coverImageUrl to captureQuoteScreenshot', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce('https://cdn.com/cover.jpg');

        await request(app)
            .post('/api/screenshot')
            .send({
                url: 'https://example.com',
                coverImageUrl: 'https://cdn.com/cover.jpg'
            });

        expect(captureQuoteScreenshot).toHaveBeenCalledWith(
            'https://example.com',
            null,
            expect.any(Object),
            'https://cdn.com/cover.jpg'
        );
    });

    it('should handle invalid URL gracefully for domain extraction', async () => {
        captureQuoteScreenshot.mockResolvedValueOnce(Buffer.from('png'));

        await request(app)
            .post('/api/screenshot')
            .send({ url: 'not-a-valid-url' });

        expect(captureQuoteScreenshot).toHaveBeenCalledWith(
            'not-a-valid-url',
            null,
            expect.objectContaining({ domain: '' }),
            undefined
        );
    });
});
