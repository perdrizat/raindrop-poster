/**
 * Graceful shutdown for Docker stop/restart: drains the Puppeteer browser pool
 * before the process dies, so Chromium children aren't left to be hard-killed.
 */
export function registerGracefulShutdown({ server, shutdownPool, exit = process.exit }) {
    let shuttingDown = false;

    const handler = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Received ${signal} — shutting down gracefully...`);

        try {
            await shutdownPool();
        } catch (err) {
            console.warn('Browser pool shutdown failed (continuing):', err.message);
        }

        // Force-exit if connections refuse to drain within 10s
        const forceTimer = setTimeout(() => exit(1), 10000);
        forceTimer.unref?.();

        server.close(() => {
            clearTimeout(forceTimer);
            exit(0);
        });
    };

    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
    return handler;
}
