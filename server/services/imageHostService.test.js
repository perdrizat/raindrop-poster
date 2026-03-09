import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');
vi.mock('./db.js', () => ({
    getSetting: vi.fn()
}));
import { getSetting } from './db.js';

describe('imageHostService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.IMGBB_API_KEY = 'test-api-key';
    });

    it('should upload a base64 image and return the public URL', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                data: {
                    url: 'https://i.ibb.co/abc123/screenshot.png',
                    display_url: 'https://i.ibb.co/abc123/screenshot.png',
                },
                success: true,
            },
        });

        // Dynamic import to pick up env var
        const { uploadImage } = await import('./imageHostService.js');

        const pngBuffer = Buffer.from('fake-png-data');
        const result = await uploadImage(pngBuffer);

        expect(result.url).toBe('https://i.ibb.co/abc123/screenshot.png');
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('https://api.imgbb.com/1/upload?key=test-api-key'),
            expect.any(URLSearchParams)
        );
    });

    it('should throw if IMGBB_API_KEY is not set', async () => {
        delete process.env.IMGBB_API_KEY;
        getSetting.mockResolvedValueOnce(null);

        const { uploadImage } = await import('./imageHostService.js');

        await expect(uploadImage(Buffer.from('data')))
            .rejects.toThrow('IMGBB_API_KEY is not configured');
    });

    it('should throw on API error', async () => {
        axios.post.mockRejectedValueOnce(new Error('Network error'));

        const { uploadImage } = await import('./imageHostService.js');

        await expect(uploadImage(Buffer.from('data')))
            .rejects.toThrow('Failed to upload image');
    });
});
