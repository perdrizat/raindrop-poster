import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock puppeteer before importing the service
vi.mock('puppeteer-extra', () => {
    const mockPage = {
        goto: vi.fn().mockResolvedValue(),
        evaluate: vi.fn().mockResolvedValue('Article text content'),
        close: vi.fn().mockResolvedValue(),
    };
    const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(),
    };
    return {
        default: {
            launch: vi.fn().mockResolvedValue(mockBrowser),
            use: vi.fn(),
        },
    };
});

import puppeteer from 'puppeteer-extra';
import { scrapeArticle } from './scraperService.js';

describe('scraperService (Puppeteer)', () => {
    let mockPage;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPage = puppeteer.launch.mock.results[0]?.value;
    });

    it('should launch a browser, navigate, and extract text', async () => {
        const text = await scrapeArticle('https://example.com/article');

        expect(puppeteer.launch).toHaveBeenCalledWith(
            expect.objectContaining({ headless: 'new' })
        );
        expect(text).toBe('Article text content');
    });

    it('should truncate extremely long text to 50000 characters', async () => {
        const longText = 'A'.repeat(60000);
        // Get the mock page from the launched browser
        const mockBrowser = await puppeteer.launch();
        const page = await mockBrowser.newPage();
        page.evaluate.mockResolvedValueOnce(longText);

        const text = await scrapeArticle('https://example.com/long-article');
        expect(text.length).toBeLessThanOrEqual(50000);
    });

    it('should throw an error if navigation fails', async () => {
        const mockBrowser = await puppeteer.launch();
        const page = await mockBrowser.newPage();
        page.goto.mockRejectedValueOnce(new Error('Navigation failed'));

        await expect(scrapeArticle('https://example.com/bad'))
            .rejects.toThrow('Failed to scrape the article.');
    });

    it('should intercept x.com URLs and use api.vxtwitter.com via fetch', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: 'This is a tweet text from vxtwitter.' })
        });

        const text = await scrapeArticle('https://x.com/user1/status/1234567890');

        expect(globalThis.fetch).toHaveBeenCalledWith('https://api.vxtwitter.com/user1/status/1234567890');
        expect(text).toBe('This is a tweet text from vxtwitter.');
        expect(puppeteer.launch).not.toHaveBeenCalled(); // Ensures Puppeteer is skipped
    });

    it('should intercept twitter.com URLs and use api.vxtwitter.com', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: 'Another tweet.' })
        });

        const text = await scrapeArticle('https://twitter.com/user2/status/0987654321?s=20');

        expect(globalThis.fetch).toHaveBeenCalledWith('https://api.vxtwitter.com/user2/status/0987654321');
        expect(text).toBe('Another tweet.');
    });
});
