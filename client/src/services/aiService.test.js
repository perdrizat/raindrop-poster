import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { generateProposals } from './aiService';

describe('aiService', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    it('should throw an error if article is missing or invalid', async () => {
        await expect(generateProposals(null, 'prompt')).rejects.toThrow('Invalid article provided');
        await expect(generateProposals({}, 'prompt')).rejects.toThrow('Invalid article provided');
    });

    it('should orchestrate scraping and generation API calls and return proposals with scrapeData', async () => {
        // Mock scrape success — new shape with markdown + html
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                markdown: '# Article\n\nScraped article content.',
                html: '<h1>Article</h1><p>Scraped article content.</p>',
                text: '# Article\n\nScraped article content.'
            })
        });

        // Mock generate success
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ proposals: ['Tweet 1', 'Tweet 2', 'Tweet 3'] })
        });

        const article = { title: 'Test', link: 'http://test.com', highlight: '' };
        const result = await generateProposals(article, 'custom prompt');

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/scrape', expect.any(Object));
        // Venice should receive the markdown content
        expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/venice/generate', expect.objectContaining({
            body: expect.stringContaining('# Article')
        }));

        expect(result.proposals).toEqual(['Tweet 1', 'Tweet 2', 'Tweet 3']);
        expect(result.author).toBeNull();
        expect(result.scrapeData).toEqual({
            markdown: '# Article\n\nScraped article content.',
            html: '<h1>Article</h1><p>Scraped article content.</p>'
        });
    });

    it('should fall back to metadata if scraping fails', async () => {
        // Mock scrape failure
        globalThis.fetch.mockResolvedValueOnce({
            ok: false,
            text: async () => 'Error fetching'
        });

        // Mock generate success
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ proposals: ['T1', 'T2', 'T3'] })
        });

        const article = { title: 'Test 2', link: 'http://test2.com', highlight: '' };
        const result = await generateProposals(article, 'prompt');

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/venice/generate', expect.objectContaining({
            body: expect.stringContaining('Text unavailable')
        }));
        expect(result.proposals).toEqual(['T1', 'T2', 'T3']);
        expect(result.author).toBeNull();
        expect(result.scrapeData).toEqual({ markdown: '', html: '' });
    });

    it('should throw if generation fails', async () => {
        // Mock scrape success
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'Text' })
        });

        // Mock generate failure
        globalThis.fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Venice API down' })
        });

        const article = { title: 'Test', link: 'http://t.com', highlight: '' };

        await expect(generateProposals(article, 'prompt')).rejects.toThrow('Venice API down');
    });
});
