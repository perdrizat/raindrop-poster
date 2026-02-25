import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { fetchTaggedItems } from './raindropioService';

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
            expect(result).toEqual(mockItems);
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
});
