import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/db.js', () => {
    let mockDb = {};
    return {
        getSetting: vi.fn().mockImplementation(async (k) => mockDb[k]),
        getConfig: vi.fn().mockImplementation(async (k) => process.env[k] || mockDb[k]),
        setSetting: vi.fn().mockImplementation(async (k, v) => { mockDb[k] = v; }),
        getUncleanedImages: vi.fn().mockResolvedValue([]),
        removePostImage: vi.fn().mockResolvedValue({}),
    };
});

vi.mock('../services/imageHostService.js', () => ({
    deleteImage: vi.fn().mockResolvedValue({}),
}));

vi.mock('axios');

import { runCleanup, shouldRunCleanup } from './cleanupService.js';
import { getSetting, setSetting, getUncleanedImages, removePostImage } from '../services/db.js';
import { deleteImage } from '../services/imageHostService.js';
import axios from 'axios';

describe('cleanupService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.BUFFER_ACCESS_TOKEN;
    });

    describe('shouldRunCleanup', () => {
        it('should return true when no last cleanup timestamp exists', async () => {
            getSetting.mockResolvedValueOnce(null);
            expect(await shouldRunCleanup()).toBe(true);
        });

        it('should return false when last cleanup was less than 6h ago', async () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            getSetting.mockResolvedValueOnce(twoHoursAgo);
            expect(await shouldRunCleanup()).toBe(false);
        });

        it('should return true when last cleanup was more than 6h ago', async () => {
            const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
            getSetting.mockResolvedValueOnce(sevenHoursAgo);
            expect(await shouldRunCleanup()).toBe(true);
        });
    });

    describe('runCleanup', () => {
        it('should do nothing when no uncleaned images exist', async () => {
            getUncleanedImages.mockResolvedValueOnce([]);
            const result = await runCleanup('mock-token');
            expect(result).toEqual({ checked: 0, cleaned: 0 });
            expect(axios.post).not.toHaveBeenCalled();
        });

        it('should delete R2 image and DB record when Buffer post is sent', async () => {
            getUncleanedImages.mockResolvedValueOnce([
                { id: 1, post_id: 'post-1', r2_key: 'screenshots/abc.png', channel_id: 'ch1' },
            ]);
            axios.post.mockResolvedValueOnce({
                data: { data: { p0: { id: 'post-1', status: 'sent', sentAt: '2026-03-20T10:00:00Z' } } }
            });

            const result = await runCleanup('mock-token');

            expect(result).toEqual({ checked: 1, cleaned: 1 });
            expect(deleteImage).toHaveBeenCalledWith('screenshots/abc.png');
            expect(removePostImage).toHaveBeenCalledWith('post-1');
        });

        it('should NOT delete when Buffer post is still scheduled', async () => {
            getUncleanedImages.mockResolvedValueOnce([
                { id: 1, post_id: 'post-1', r2_key: 'screenshots/abc.png', channel_id: 'ch1' },
            ]);
            axios.post.mockResolvedValueOnce({
                data: { data: { p0: { id: 'post-1', status: 'scheduled', sentAt: null } } }
            });

            const result = await runCleanup('mock-token');

            expect(result).toEqual({ checked: 1, cleaned: 0 });
            expect(deleteImage).not.toHaveBeenCalled();
            expect(removePostImage).not.toHaveBeenCalled();
        });

        it('resolves all images in a single batched request, cleaning only sent ones', async () => {
            getUncleanedImages.mockResolvedValueOnce([
                { id: 1, post_id: 'post-1', r2_key: 'screenshots/a.png', channel_id: 'ch1' },
                { id: 2, post_id: 'post-2', r2_key: 'screenshots/b.png', channel_id: 'ch2' },
                { id: 3, post_id: 'post-3', r2_key: 'screenshots/c.png', channel_id: 'ch3' },
            ]);
            // One aliased response for all three posts: sent / draft / sent.
            axios.post.mockResolvedValueOnce({
                data: { data: {
                    p0: { id: 'post-1', status: 'sent' },
                    p1: { id: 'post-2', status: 'draft' },
                    p2: { id: 'post-3', status: 'sent' },
                } }
            });

            const result = await runCleanup('mock-token');

            expect(result).toEqual({ checked: 3, cleaned: 2 });
            expect(deleteImage).toHaveBeenCalledTimes(2);
            expect(removePostImage).toHaveBeenCalledTimes(2);
            // The economy fix: one Buffer request for all three images, not three.
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        it('splits into multiple requests when the backlog exceeds the batch size', async () => {
            getUncleanedImages.mockResolvedValueOnce([
                { id: 1, post_id: 'post-1', r2_key: 'screenshots/a.png', channel_id: 'ch1' },
                { id: 2, post_id: 'post-2', r2_key: 'screenshots/b.png', channel_id: 'ch2' },
                { id: 3, post_id: 'post-3', r2_key: 'screenshots/c.png', channel_id: 'ch3' },
            ]);
            axios.post
                .mockResolvedValueOnce({ data: { data: { p0: { status: 'sent' }, p1: { status: 'draft' } } } })
                .mockResolvedValueOnce({ data: { data: { p0: { status: 'sent' } } } });

            const result = await runCleanup('mock-token', { batchSize: 2 });

            expect(result).toEqual({ checked: 3, cleaned: 2 });
            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(deleteImage).toHaveBeenCalledWith('screenshots/a.png');
            expect(deleteImage).toHaveBeenCalledWith('screenshots/c.png');
        });

        it('should skip and not crash when the batched Buffer request errors', async () => {
            getUncleanedImages.mockResolvedValueOnce([
                { id: 1, post_id: 'post-1', r2_key: 'screenshots/a.png', channel_id: 'ch1' },
            ]);
            axios.post.mockRejectedValueOnce(new Error('Network error'));

            const result = await runCleanup('mock-token');

            expect(result).toEqual({ checked: 1, cleaned: 0 });
            expect(deleteImage).not.toHaveBeenCalled();
        });

        it('should update last cleanup timestamp after run', async () => {
            getUncleanedImages.mockResolvedValueOnce([]);
            await runCleanup('mock-token');
            expect(setSetting).toHaveBeenCalledWith('LAST_CLEANUP', expect.any(String));
        });
    });
});
