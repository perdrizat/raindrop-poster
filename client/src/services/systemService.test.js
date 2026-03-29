import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSystemStatus, configureSystem } from './systemService';

describe('systemService', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe('getSystemStatus', () => {
        it('should fetch and return system status', async () => {
            const mockStatus = {
                isConfigured: true,
                hasRaindropConfig: true,
                hasVeniceConfig: true,
                hasBufferConfig: false,
                hasR2Config: false,
            };
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => mockStatus,
            });

            const result = await getSystemStatus();
            expect(result).toEqual(mockStatus);
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/system/status');
        });

        it('should throw on non-ok response', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'Internal error' }),
            });

            await expect(getSystemStatus()).rejects.toThrow('Failed to fetch system status');
        });

        it('should throw on network error', async () => {
            globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('offline'));
            await expect(getSystemStatus()).rejects.toThrow();
        });
    });

    describe('configureSystem', () => {
        it('should POST configuration and return result', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, message: 'Configuration saved successfully.' }),
            });

            const config = {
                raindropClientId: 'rd_id',
                veniceApiKey: 'venice_key',
            };

            const result = await configureSystem(config);
            expect(result.success).toBe(true);
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/system/configure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
        });

        it('should throw on non-ok response', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: false,
                json: async () => ({ error: 'Failed' }),
            });

            await expect(configureSystem({})).rejects.toThrow('Failed to configure system');
        });

        it('should throw on network error', async () => {
            globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('offline'));
            await expect(configureSystem({})).rejects.toThrow();
        });
    });
});
