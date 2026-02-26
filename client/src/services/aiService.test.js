import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { generateProposals, selectEngagingHighlight } from './aiService';

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

        expect(proposals).toEqual({
            proposals: ['Tweet 1', 'Tweet 2', 'Tweet 3'],
            author: null
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

        const article = { title: 'Test 2', link: 'http://test2.com', highlights: [] };
        const proposals = await generateProposals(article, 'prompt');

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/venice/generate', expect.objectContaining({
            body: expect.stringContaining('Text unavailable')
        }));
        expect(proposals).toEqual({
            proposals: ['T1', 'T2', 'T3'],
            author: null
        });
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
    describe('selectEngagingHighlight', () => {
        it('should call /api/venice/generate and return the best highlight', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ highlight: 'This is the best highlight' })
            });

            const article = { title: 'Test Article', link: 'http://test.com' };
            const highlights = [{ text: 'Highlight 1' }, { text: 'This is the best highlight' }];
            const objectives = 'Make it engaging';

            const result = await selectEngagingHighlight(objectives, article, highlights);

            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/venice/generate', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: expect.stringContaining('Highlight 1')
            }));
            expect(result).toBe('This is the best highlight');
        });

        it('should throw an error if the API request fails', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'Venice API Error' })
            });

            const article = { title: 'Test Article', link: 'http://test.com' };
            const highlights = [{ text: 'Highlight 1' }];
            const objectives = 'Make it engaging';

            await expect(selectEngagingHighlight(objectives, article, highlights)).rejects.toThrow('Venice API Error');
        });
    });
});
