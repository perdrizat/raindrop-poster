import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { refreshRaindropToken, getValidRaindropToken, withTokenRefresh } from './raindropAuth.js';
import { getSetting, setSetting } from './db.js';

vi.mock('axios');
vi.mock('./db.js', () => {
    let mockDb = {};
    return {
        getSetting: vi.fn().mockImplementation(async (k) => mockDb[k]),
        setSetting: vi.fn().mockImplementation(async (k, v) => { mockDb[k] = v; }),
    };
});

// Helper to set up mock DB state — uses setSetting which writes to mockDb
async function setDb(entries) {
    // Clear first by resetting all known keys
    for (const key of ['RAINDROPIO_ACCESS_TOKEN', 'RAINDROPIO_REFRESH_TOKEN', 'RAINDROPIO_EXPIRES_AT',
        'RAINDROPIO_CLIENT_ID', 'RAINDROPIO_CLIENT_SECRET']) {
        await setSetting(key, undefined);
    }
    for (const [k, v] of Object.entries(entries)) {
        await setSetting(k, v);
    }
}

describe('refreshRaindropToken', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await setDb({});
    });

    it('returns null when refresh token is missing', async () => {
        await setDb({ RAINDROPIO_CLIENT_ID: 'cid', RAINDROPIO_CLIENT_SECRET: 'cs' });
        const result = await refreshRaindropToken();
        expect(result).toBeNull();
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('returns null when client credentials are missing', async () => {
        await setDb({ RAINDROPIO_REFRESH_TOKEN: 'rt' });
        const result = await refreshRaindropToken();
        expect(result).toBeNull();
    });

    it('refreshes token successfully and persists new tokens', async () => {
        await setDb({
            RAINDROPIO_REFRESH_TOKEN: 'old-rt',
            RAINDROPIO_CLIENT_ID: 'cid',
            RAINDROPIO_CLIENT_SECRET: 'cs',
        });

        axios.post.mockResolvedValueOnce({
            data: {
                access_token: 'new-at',
                refresh_token: 'new-rt',
                expires_in: 1209600,
            }
        });

        const result = await refreshRaindropToken();
        expect(result).toBe('new-at');
        expect(setSetting).toHaveBeenCalledWith('RAINDROPIO_ACCESS_TOKEN', 'new-at');
        expect(setSetting).toHaveBeenCalledWith('RAINDROPIO_REFRESH_TOKEN', 'new-rt');
        expect(setSetting).toHaveBeenCalledWith('RAINDROPIO_EXPIRES_AT', expect.any(String));
    });

    it('returns null when API returns no access_token', async () => {
        await setDb({
            RAINDROPIO_REFRESH_TOKEN: 'rt',
            RAINDROPIO_CLIENT_ID: 'cid',
            RAINDROPIO_CLIENT_SECRET: 'cs',
        });

        axios.post.mockResolvedValueOnce({ data: { error: 'invalid_grant' } });

        const result = await refreshRaindropToken();
        expect(result).toBeNull();
    });

    it('returns null when API call throws', async () => {
        await setDb({
            RAINDROPIO_REFRESH_TOKEN: 'rt',
            RAINDROPIO_CLIENT_ID: 'cid',
            RAINDROPIO_CLIENT_SECRET: 'cs',
        });

        axios.post.mockRejectedValueOnce(new Error('Network error'));

        const result = await refreshRaindropToken();
        expect(result).toBeNull();
    });
});

describe('getValidRaindropToken', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await setDb({});
    });

    it('returns session token when not expired', async () => {
        const req = {
            session: {
                raindropio: {
                    accessToken: 'session-token',
                    expiresAt: Date.now() + 60 * 60 * 1000,
                }
            }
        };

        const token = await getValidRaindropToken(req);
        expect(token).toBe('session-token');
    });

    it('returns DB token when not expired', async () => {
        await setDb({
            RAINDROPIO_ACCESS_TOKEN: 'db-token',
            RAINDROPIO_EXPIRES_AT: String(Date.now() + 60 * 60 * 1000),
        });

        const token = await getValidRaindropToken({});
        expect(token).toBe('db-token');
    });

    it('attempts refresh when DB token is near expiry', async () => {
        await setDb({
            RAINDROPIO_ACCESS_TOKEN: 'old-token',
            RAINDROPIO_EXPIRES_AT: String(Date.now() + 60 * 1000), // 1 min — within 5-min margin
            RAINDROPIO_REFRESH_TOKEN: 'rt',
            RAINDROPIO_CLIENT_ID: 'cid',
            RAINDROPIO_CLIENT_SECRET: 'cs',
        });

        axios.post.mockResolvedValueOnce({
            data: { access_token: 'refreshed-token', refresh_token: 'new-rt', expires_in: 1209600 }
        });

        const token = await getValidRaindropToken({});
        expect(token).toBe('refreshed-token');
    });

    it('returns DB token without expiry info (legacy tokens)', async () => {
        await setDb({ RAINDROPIO_ACCESS_TOKEN: 'legacy-token' });

        const token = await getValidRaindropToken({});
        expect(token).toBe('legacy-token');
    });

    it('returns null when no token exists', async () => {
        const token = await getValidRaindropToken({});
        expect(token).toBeNull();
    });
});

describe('withTokenRefresh', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await setDb({
            RAINDROPIO_ACCESS_TOKEN: 'valid-token',
            RAINDROPIO_EXPIRES_AT: String(Date.now() + 60 * 60 * 1000),
        });
    });

    it('calls apiCall with valid token on success', async () => {
        const apiCall = vi.fn().mockResolvedValue({ user: 'test' });

        const result = await withTokenRefresh(apiCall, {});
        expect(result).toEqual({ user: 'test' });
        expect(apiCall).toHaveBeenCalledWith('valid-token');
    });

    it('retries with refreshed token on 401', async () => {
        await setDb({
            RAINDROPIO_ACCESS_TOKEN: 'expired-token',
            RAINDROPIO_EXPIRES_AT: String(Date.now() + 60 * 60 * 1000),
            RAINDROPIO_REFRESH_TOKEN: 'rt',
            RAINDROPIO_CLIENT_ID: 'cid',
            RAINDROPIO_CLIENT_SECRET: 'cs',
        });

        axios.post.mockResolvedValueOnce({
            data: { access_token: 'new-token', refresh_token: 'new-rt', expires_in: 1209600 }
        });

        const apiCall = vi.fn()
            .mockRejectedValueOnce({ response: { status: 401 } })
            .mockResolvedValueOnce({ user: 'test' });

        const result = await withTokenRefresh(apiCall, {});
        expect(result).toEqual({ user: 'test' });
        expect(apiCall).toHaveBeenCalledTimes(2);
        expect(apiCall).toHaveBeenNthCalledWith(2, 'new-token');
    });

    it('throws 401 error when refresh also fails', async () => {
        await setDb({
            RAINDROPIO_ACCESS_TOKEN: 'expired-token',
            RAINDROPIO_EXPIRES_AT: String(Date.now() + 60 * 60 * 1000),
        });

        const apiCall = vi.fn()
            .mockRejectedValueOnce({ response: { status: 401 } });

        await expect(withTokenRefresh(apiCall, {})).rejects.toMatchObject({
            status: 401,
            message: expect.stringContaining('expired'),
        });
    });

    it('throws when no token is available at all', async () => {
        await setDb({});

        const apiCall = vi.fn();

        await expect(withTokenRefresh(apiCall, {})).rejects.toMatchObject({
            status: 401,
        });
        expect(apiCall).not.toHaveBeenCalled();
    });

    it('rethrows non-401 errors without retry', async () => {
        const apiCall = vi.fn()
            .mockRejectedValueOnce({ response: { status: 500 }, message: 'Server error' });

        await expect(withTokenRefresh(apiCall, {})).rejects.toMatchObject({
            response: { status: 500 },
        });
        expect(apiCall).toHaveBeenCalledTimes(1);
    });
});
