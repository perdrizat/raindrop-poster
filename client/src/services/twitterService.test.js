import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishPost } from './twitterService';

describe('twitterService', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('publishPost should post to /api/publish with text, articleUrl, and screenshotUrl', async () => {
        const mockResponse = { success: true, url: 'https://twitter.com/user/status/12345' };

        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => mockResponse,
        });

        const result = await publishPost(
            'Test post text',
            'https://example.com/article',
            'https://i.ibb.co/abc/shot.png',
            'buffer',
            ['channel1']
        );

        expect(globalThis.fetch).toHaveBeenCalledWith('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: 'Test post text',
                articleUrl: 'https://example.com/article',
                screenshotUrl: 'https://i.ibb.co/abc/shot.png',
                destination: 'buffer',
                targetChannels: ['channel1'],
            }),
        });

        expect(result).toEqual(mockResponse);
    });

    it('publishPost should throw an error if the API request fails', async () => {
        globalThis.fetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'API Error' }),
        });

        await expect(publishPost('Text', 'https://example.com'))
            .rejects.toThrow('API Error');
    });

    it('publishPost should handle null screenshotUrl gracefully', async () => {
        globalThis.fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, url: 'https://twitter.com/post/1' }),
        });

        const result = await publishPost('Text', 'https://example.com', null, 'twitter');

        expect(result.success).toBe(true);

        const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(body.screenshotUrl).toBeNull();
    });
});
