import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { bufferGraphql, getBufferRateLimit } from './bufferService.js';

vi.mock('axios');

// An HTTP 429 as axios surfaces it (thrown, with a response body).
const throttle429 = (headers = {}) => {
    const err = new Error('Request failed with status code 429');
    err.response = {
        status: 429,
        headers,
        data: { errors: [{ message: 'Too many requests from this client. Please try again later.' }] },
    };
    return err;
};

describe('bufferService.bufferGraphql', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns response data and does not retry on success', async () => {
        axios.post.mockResolvedValueOnce({ data: { data: { ok: true } } });

        const data = await bufferGraphql('tok', 'query', {}, { baseDelayMs: 0 });

        expect(data).toEqual({ data: { ok: true } });
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('retries a thrown HTTP 429 and returns once it succeeds', async () => {
        axios.post
            .mockRejectedValueOnce(throttle429())
            .mockRejectedValueOnce(throttle429())
            .mockResolvedValueOnce({ data: { data: { ok: true } } });

        const data = await bufferGraphql('tok', 'q', {}, { baseDelayMs: 0 });

        expect(data).toEqual({ data: { ok: true } });
        expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('retries a 200 body that carries a "Too many requests" GraphQL error', async () => {
        axios.post
            .mockResolvedValueOnce({ data: { errors: [{ message: 'Too many requests from this client.' }] } })
            .mockResolvedValueOnce({ data: { data: { ok: true } } });

        const data = await bufferGraphql('tok', 'q', {}, { baseDelayMs: 0 });

        expect(data).toEqual({ data: { ok: true } });
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('gives up after the retry budget and throws the throttle error', async () => {
        axios.post.mockRejectedValue(throttle429());

        await expect(
            bufferGraphql('tok', 'q', {}, { retries: 2, baseDelayMs: 0 })
        ).rejects.toThrow(/429|too many/i);
        expect(axios.post).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('does not retry non-throttle errors', async () => {
        const err = new Error('Request failed with status code 400');
        err.response = { status: 400, data: { errors: [{ message: 'Invalid input' }] } };
        axios.post.mockRejectedValue(err);

        await expect(bufferGraphql('tok', 'q', {}, { baseDelayMs: 0 })).rejects.toThrow(/400/);
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('captures the rate-limit snapshot from x-ratelimit-* response headers', async () => {
        axios.post.mockResolvedValueOnce({
            headers: {
                'x-ratelimit-limit': '100',
                'x-ratelimit-remaining': '5',
                'x-ratelimit-reset': '1783007064',
            },
            data: { data: { ok: true } },
        });

        await bufferGraphql('tok', 'q', {}, { baseDelayMs: 0 });

        const rl = getBufferRateLimit();
        expect(rl.limit).toBe(100);
        expect(rl.remaining).toBe(5);
        expect(rl.resetAt).toBe(1783007064 * 1000);
    });

    it('honours a Retry-After header (seconds) when throttled', async () => {
        axios.post
            .mockRejectedValueOnce(throttle429({ 'retry-after': '0' }))
            .mockResolvedValueOnce({ data: { data: { ok: true } } });

        const data = await bufferGraphql('tok', 'q', {}, { baseDelayMs: 0 });

        expect(data).toEqual({ data: { ok: true } });
        expect(axios.post).toHaveBeenCalledTimes(2);
    });
});
