import request from 'supertest';
import express from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import scrapeRoutes from './scrape.js';
import * as scraperService from '../services/scraperService.js';

vi.mock('../services/scraperService.js', () => ({
    scrapeArticle: vi.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/scrape', scrapeRoutes);

describe('Scrape Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 400 if URL is missing', async () => {
        const res = await request(app)
            .post('/api/scrape')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'URL is required' });
    });

    it('should return 400 if URL is invalid', async () => {
        const res = await request(app)
            .post('/api/scrape')
            .send({ url: 'not-a-valid-url' });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid URL format' });
    });

    it('should successfully scrape and return text', async () => {
        scraperService.scrapeArticle.mockResolvedValueOnce('This is the scraped text content.');

        const res = await request(app)
            .post('/api/scrape')
            .send({ url: 'https://example.com/article' });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ text: 'This is the scraped text content.' });
        expect(scraperService.scrapeArticle).toHaveBeenCalledWith('https://example.com/article');
    });

    it('should handle scraper service errors gracefully', async () => {
        scraperService.scrapeArticle.mockRejectedValueOnce(new Error('Failed to fetch'));

        const res = await request(app)
            .post('/api/scrape')
            .send({ url: 'https://example.com/article' });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to scrape the article.' });
    });
});
