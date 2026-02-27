import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishThread } from './twitterService';

describe('twitterService', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('publishThread should post to /api/publish and return the response data including destination', async () => {
        const mockResponse = { success: true, url: 'https://twitter.com/user/status/12345' };

        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        const tweet1 = "This is the first tweet.";
        const tweet2 = "And this is the second tweet.";

        const result = await publishThread(tweet1, tweet2, 'buffer');

        expect(globalThis.fetch).toHaveBeenCalledWith('/api/publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tweet1, tweet2, destination: 'buffer', targetChannels: [] }),
        });

        expect(result).toEqual(mockResponse);
    });

    it('publishThread should throw an error if the API request fails', async () => {
        globalThis.fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Twitter API Error: Unauthorized' }),
        });

        await expect(publishThread("Tweet 1", "Tweet 2")).rejects.toThrow('Twitter API Error: Unauthorized');
    });

    it('publishThread should throw a generic error if the network request fails entirely', async () => {
        globalThis.fetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(publishThread("Tweet 1", "Tweet 2")).rejects.toThrow('Network error');
    });
});
