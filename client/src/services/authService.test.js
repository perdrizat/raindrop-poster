import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, testConnection, checkAuthStatus } from './authService';

describe('authService', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        vi.clearAllMocks();
        delete window.location;
        window.location = { href: '' };
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe('login', () => {
        it('should redirect to the provider OAuth endpoint', () => {
            login('raindropio');
            expect(window.location.href).toBe('/api/auth/raindropio');
        });
    });

    describe('testConnection', () => {
        it('should call the correct endpoint for each provider', async () => {
            const providers = {
                raindropio: '/api/raindropio/test',
                venice: '/api/venice/test',
                buffer: '/api/auth/buffer/test',
                r2: '/api/auth/r2/test',
            };

            for (const [provider, expectedUrl] of Object.entries(providers)) {
                globalThis.fetch = vi.fn().mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ success: true }),
                });
                await testConnection(provider);
                expect(globalThis.fetch).toHaveBeenCalledWith(expectedUrl, { credentials: 'include' });
            }
        });

        it('should return data on success', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, user: 'test-user' }),
            });
            const result = await testConnection('raindropio');
            expect(result).toEqual({ success: true, user: 'test-user' });
        });

        it('should return error object on non-ok response', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'Token expired' }),
            });
            const result = await testConnection('buffer');
            expect(result).toEqual({ error: 'Token expired' });
        });

        it('should return network error on fetch failure', async () => {
            globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));
            const result = await testConnection('venice');
            expect(result).toEqual({ error: 'Network error connecting to backend' });
        });
    });

    describe('checkAuthStatus', () => {
        it('should return auth status from the API', async () => {
            const mockStatus = { raindropio: true, venice: true, buffer: false, r2: false };
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => mockStatus,
            });
            const result = await checkAuthStatus();
            expect(result).toEqual(mockStatus);
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/status', { credentials: 'include' });
        });

        it('should return all-false defaults on network error', async () => {
            globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('offline'));
            const result = await checkAuthStatus();
            expect(result).toEqual({ raindropio: false, venice: false, buffer: false, r2: false });
        });
    });
});
