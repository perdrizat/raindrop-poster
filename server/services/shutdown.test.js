import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerGracefulShutdown } from './shutdown.js';

describe('registerGracefulShutdown', () => {
    let server, shutdownPool, exit, handlers;

    beforeEach(() => {
        handlers = {};
        vi.spyOn(process, 'on').mockImplementation((signal, fn) => { handlers[signal] = fn; });
        server = { close: vi.fn((cb) => cb && cb()) };
        shutdownPool = vi.fn().mockResolvedValue(undefined);
        exit = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('registers handlers for SIGTERM and SIGINT', () => {
        registerGracefulShutdown({ server, shutdownPool, exit });
        expect(handlers.SIGTERM).toBeTypeOf('function');
        expect(handlers.SIGINT).toBeTypeOf('function');
    });

    it('drains the browser pool, closes the server, then exits 0', async () => {
        registerGracefulShutdown({ server, shutdownPool, exit });
        await handlers.SIGTERM('SIGTERM');

        expect(shutdownPool).toHaveBeenCalledOnce();
        expect(server.close).toHaveBeenCalledOnce();
        expect(exit).toHaveBeenCalledWith(0);
    });

    it('still exits cleanly when pool shutdown throws', async () => {
        shutdownPool.mockRejectedValueOnce(new Error('chromium already dead'));
        registerGracefulShutdown({ server, shutdownPool, exit });
        await handlers.SIGINT('SIGINT');

        expect(server.close).toHaveBeenCalledOnce();
        expect(exit).toHaveBeenCalledWith(0);
    });

    it('ignores repeated signals while a shutdown is in flight', async () => {
        registerGracefulShutdown({ server, shutdownPool, exit });
        await Promise.all([handlers.SIGTERM('SIGTERM'), handlers.SIGTERM('SIGTERM')]);

        expect(shutdownPool).toHaveBeenCalledOnce();
        expect(server.close).toHaveBeenCalledOnce();
    });
});
