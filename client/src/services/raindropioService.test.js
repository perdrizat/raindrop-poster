import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { fetchTags, fetchTaggedItems, updateBookmarkTags } from './raindropioService';

describe('raindropioService', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    describe('fetchTags', () => {
        it('should return tag names from objects with _id', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    tags: [{ _id: 'react', count: 5 }, { _id: 'vue', count: 3 }]
                })
            });
            const result = await fetchTags();
            expect(result).toEqual(['react', 'vue']);
        });

        it('should handle string tags (non-object format)', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ tags: ['alpha', 'beta'] })
            });
            const result = await fetchTags();
            expect(result).toEqual(['alpha', 'beta']);
        });

        it('should return empty array when tags is null/missing', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });
            const result = await fetchTags();
            expect(result).toEqual([]);
        });

        it('should throw on 401 unauthorized', async () => {
            globalThis.fetch.mockResolvedValueOnce({ status: 401 });
            await expect(fetchTags()).rejects.toThrow('unauthorized');
        });

        it('should return empty array on network error', async () => {
            globalThis.fetch.mockRejectedValueOnce(new Error('Network error'));
            const result = await fetchTags();
            expect(result).toEqual([]);
        });
    });

    describe('fetchTaggedItems', () => {
        it('should return successfully parsed items for a given tag', async () => {
            const mockItems = [{ id: 1, title: 'Item 1' }, { id: 2, title: 'Item 2' }];
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    items: mockItems
                })
            });

            const result = await fetchTaggedItems('important');

            expect(globalThis.fetch).toHaveBeenCalledWith('/api/raindropio/raindrops/0?search=' + encodeURIComponent('[{"key":"tag","val":"important"}]'));
            expect(result).toEqual([{ id: 1, title: 'Item 1', highlight: '' }, { id: 2, title: 'Item 2', highlight: '' }]);
        });

        it('should map the note field into a highlights array if highlights are missing', async () => {
            const mockItemsWithNote = [
                { id: 1, title: 'No Highlight', note: 'This is a note fallback' },
                { id: 2, title: 'Has Highlight', highlights: [{ text: 'Real highlight' }], note: 'Ignored note' },
                { id: 3, title: 'No Highlight No Note' }
            ];
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    items: mockItemsWithNote
                })
            });

            const result = await fetchTaggedItems('test-tag');

            expect(result[0].highlight).toEqual('This is a note fallback');
            expect(result[1].highlight).toEqual('Real highlight');
            expect(result[2].highlight).toEqual(''); // Added missing fallback case
        });

        it('should throw on 401 unauthorized', async () => {
            globalThis.fetch.mockResolvedValueOnce({ status: 401 });
            await expect(fetchTaggedItems('tag')).rejects.toThrow('unauthorized');
        });

        it('should return empty array on failure or missing items array', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' })
            });

            const result = await fetchTaggedItems('error-tag');

            expect(result).toEqual([]);
        });

        it('should strip marketing tracking params from article URLs', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    items: [
                        { id: 1, link: 'https://example.com/a?utm_source=newsletter&utm_medium=email' },
                        { id: 2, link: 'https://slowmist.medium.com/analysis-x?source=rss-4ceeedda40e8------2' },
                        { id: 3, link: 'https://example.com/c?source=newsletter&keep=this' },
                        { id: 4, link: 'https://example.com/d?share_via=twitter' },
                    ],
                }),
            });

            const result = await fetchTaggedItems('tag');

            expect(result[0].link).toBe('https://example.com/a');
            expect(result[1].link).toBe('https://slowmist.medium.com/analysis-x');
            expect(result[2].link).toBe('https://example.com/c?keep=this');
            expect(result[3].link).toBe('https://example.com/d');
        });
    });

    describe('updateBookmarkTags', () => {
        it('should send a PUT request to update the tags for a specific bookmark', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    item: { _id: 1234, tags: ['new_tag_posted'] }
                })
            });

            const result = await updateBookmarkTags('1234', ['new_tag_posted']);

            expect(globalThis.fetch).toHaveBeenCalledWith('/api/raindropio/bookmark/1234', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tags: ['new_tag_posted'] }),
            });
            expect(result).toBe(true);
        });

        it('should throw on 401 unauthorized', async () => {
            globalThis.fetch.mockResolvedValueOnce({ status: 401 });
            await expect(updateBookmarkTags('1234', ['tag'])).rejects.toThrow('unauthorized');
        });

        it('should return false if the API request fails', async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' })
            });

            const result = await updateBookmarkTags('1234', ['tag']);

            expect(result).toBe(false);
        });
    });
});
