import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { fetchTaggedItems, updateBookmarkTags } from './raindropioService';

describe('raindropioService', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
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
            expect(result).toEqual([{ id: 1, title: 'Item 1' }, { id: 2, title: 'Item 2' }]);
        });

        it('should map the note field into a highlights array if highlights are missing', async () => {
            const mockItemsWithNote = [
                { id: 1, title: 'No Highlight', note: 'This is a note fallback' },
                { id: 2, title: 'Has Highlight', highlights: [{ text: 'Real highlight' }], note: 'Ignored note' }
            ];
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    items: mockItemsWithNote
                })
            });

            const result = await fetchTaggedItems('test-tag');

            expect(result[0].highlights).toEqual([{ text: 'This is a note fallback' }]);
            expect(result[1].highlights).toEqual([{ text: 'Real highlight' }]);
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
