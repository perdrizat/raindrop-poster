import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishPost } from './publishService';

describe('publishService', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('should send text, articleUrl, destination, targetChannels, and bufferMode', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, url: 'https://buffer.com/1' }),
        });

        await publishPost('Hello world', 'https://example.com', {}, 'buffer', ['ch1'], 'draft');

        expect(globalThis.fetch).toHaveBeenCalledWith('/api/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: 'Hello world',
                articleUrl: 'https://example.com',
                destination: 'buffer',
                targetChannels: ['ch1'],
                bufferMode: 'draft',
            }),
        });
    });

    it('should include imageData when provided', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        await publishPost('Post', 'https://example.com', { imageData: 'data:image/png;base64,abc' }, 'buffer', ['ch1'], 'now');

        const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(sentBody.imageData).toBe('data:image/png;base64,abc');
        expect(sentBody.coverUrl).toBeUndefined();
    });

    it('should include coverUrl when provided', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        await publishPost('Post', 'https://example.com', { coverUrl: 'https://img.com/cover.jpg' }, 'buffer', ['ch1'], 'draft');

        const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(sentBody.coverUrl).toBe('https://img.com/cover.jpg');
        expect(sentBody.imageData).toBeUndefined();
    });

    it('should not include imageData or coverUrl when imageInfo is empty', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        await publishPost('Post', 'https://example.com', {}, 'buffer', ['ch1'], 'draft');

        const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(sentBody.imageData).toBeUndefined();
        expect(sentBody.coverUrl).toBeUndefined();
    });

    it('should return data on success', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, url: 'https://buffer.com/post/1', postedIds: ['p1'] }),
        });

        const result = await publishPost('Test', 'https://example.com', {});
        expect(result.success).toBe(true);
        expect(result.postedIds).toEqual(['p1']);
    });

    it('should throw an error on non-ok response', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Buffer credentials not configured' }),
        });

        await expect(publishPost('Test', 'https://example.com', {})).rejects.toThrow('Buffer credentials not configured');
    });

    it('should use default values for optional parameters', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        await publishPost('Test', 'https://example.com', {});

        const sentBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(sentBody.destination).toBe('buffer');
        expect(sentBody.targetChannels).toEqual([]);
        expect(sentBody.bufferMode).toBe('draft');
    });

    it('forwards an AbortSignal to fetch when passed', async () => {
        globalThis.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true }),
        });

        const controller = new AbortController();
        await publishPost('Test', 'https://example.com', {}, 'buffer', [], 'draft', controller.signal);

        expect(globalThis.fetch).toHaveBeenCalledWith(
            '/api/publish',
            expect.objectContaining({ signal: controller.signal })
        );
    });
});
