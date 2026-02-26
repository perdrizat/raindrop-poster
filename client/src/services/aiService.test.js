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

    it('should orchestrate scraping and generation API calls and return proposals', async () => {
        // Mock scrape success
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: 'Scraped article content.' })
        });

        // Mock generate success
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ proposals: ['Tweet 1', 'Tweet 2', 'Tweet 3'] })
        });

        const article = { title: 'Test', link: 'http://test.com', highlights: [] };
        const proposals = await generateProposals(article, 'custom prompt');

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenNthCalledWith(1, '/api/scrape', expect.any(Object));
        expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/venice/generate', expect.objectContaining({
            body: expect.stringContaining('Scraped article content.')
        }));

        expect(proposals).toEqual(['Tweet 1', 'Tweet 2', 'Tweet 3']);
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

        const article = { title: 'Test 2', link: 'http://test2.com', highlights: [] };
        const proposals = await generateProposals(article, 'prompt');

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/venice/generate', expect.objectContaining({
            body: expect.stringContaining('Text unavailable')
        }));
        expect(proposals).toEqual(['T1', 'T2', 'T3']);
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

        const article = { title: 'Test', link: 'http://t.com', highlights: [] };

        await expect(generateProposals(article, 'prompt')).rejects.toThrow('Venice API down');
    });
});
