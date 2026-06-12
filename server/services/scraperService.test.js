import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock puppeteer before importing the service
vi.mock('puppeteer-extra', () => {
    const mockPage = {
        goto: vi.fn().mockResolvedValue(),
        evaluate: vi.fn().mockResolvedValue('Article text content'),
        content: vi.fn().mockResolvedValue('<html><body><article><p>Article text content</p></article></body></html>'),
        close: vi.fn().mockResolvedValue(),
    };
    const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(),
        connected: true, // required for generic-pool's validate() to pass
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
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return { markdown, html } from scrapeArticle', async () => {
        const result = await scrapeArticle('https://example.com/article');
        expect(result).toHaveProperty('markdown');
        expect(result).toHaveProperty('html');
        expect(typeof result.markdown).toBe('string');
        expect(typeof result.html).toBe('string');
        expect(result.markdown.length).toBeGreaterThan(0);
        expect(result.html.length).toBeGreaterThan(0);
    });

    it('should extract article content as markdown via Readability', async () => {
        const mockBrowser = await puppeteer.launch();
        const page = await mockBrowser.newPage();
        page.content.mockResolvedValueOnce(`
            <html><head><title>Test Article</title></head>
            <body><article>
                <h1>Big Headline</h1>
                <p>First paragraph of the article.</p>
                <p>Second paragraph with <strong>bold</strong> text.</p>
            </article></body></html>
        `);

        const result = await scrapeArticle('https://example.com/article');
        expect(result.markdown).toContain('First paragraph');
        expect(result.markdown).toContain('Second paragraph');
        expect(result.html).toContain('First paragraph');
    });

    it('should truncate extremely long markdown to 50000 characters', async () => {
        const longParagraph = '<p>' + 'A'.repeat(60000) + '</p>';
        const mockBrowser = await puppeteer.launch();
        const page = await mockBrowser.newPage();
        page.content.mockResolvedValueOnce(
            `<html><head><title>Long</title></head><body><article>${longParagraph}</article></body></html>`
        );

        const result = await scrapeArticle('https://example.com/long-article');
        expect(result.markdown.length).toBeLessThanOrEqual(50000);
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

        const result = await scrapeArticle('https://x.com/user1/status/1234567890');

        expect(globalThis.fetch).toHaveBeenCalledWith('https://api.vxtwitter.com/user1/status/1234567890');
        expect(result.markdown).toBe('This is a tweet text from vxtwitter.');
        expect(result.html).toBe('');
        // Pool pre-warms at init; no new launch should happen during this request
        expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    it('should intercept twitter.com URLs and use api.vxtwitter.com', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ text: 'Another tweet.' })
        });

        const result = await scrapeArticle('https://twitter.com/user2/status/0987654321?s=20');

        expect(globalThis.fetch).toHaveBeenCalledWith('https://api.vxtwitter.com/user2/status/0987654321');
        expect(result.markdown).toBe('Another tweet.');
        expect(result.html).toBe('');
    });

    it('should fall back to page.evaluate text extraction if Readability fails', async () => {
        const mockBrowser = await puppeteer.launch();
        const page = await mockBrowser.newPage();
        // Return minimal HTML that Readability can't parse
        page.content.mockResolvedValueOnce('<html><body></body></html>');
        page.evaluate.mockResolvedValueOnce('Fallback plain text content');

        const result = await scrapeArticle('https://example.com/minimal');
        expect(result.markdown).toBe('Fallback plain text content');
        expect(result.html).toBe('');
    });
});
