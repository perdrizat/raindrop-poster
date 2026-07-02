import express from 'express';
import { getConfig } from '../services/db.js';
import { shouldRunCleanup, runCleanup } from '../services/cleanupService.js';

const router = express.Router();

router.get('/trigger', async (req, res) => {
    try {
        const due = await shouldRunCleanup();
        if (!due) {
            return res.json({ skipped: true, reason: 'Not due yet' });
        }

        const bufferAccessToken = await getConfig('BUFFER_ACCESS_TOKEN');
        if (!bufferAccessToken) {
            return res.json({ skipped: true, reason: 'No Buffer token' });
        }

        // Respond immediately and run cleanup detached. Cleanup makes several
        // (retrying, potentially slow) Buffer calls; awaiting it here holds the
        // client's connection open, and under the browser's per-origin connection
        // limit that starves other requests on page load (e.g. provider Test
        // Connections). The client fires this fire-and-forget, so it never reads
        // the result anyway.
        res.json({ started: true });
        runCleanup(bufferAccessToken)
            .then(result => console.log(`Cleanup completed: checked=${result.checked} cleaned=${result.cleaned}`))
            .catch(error => console.error('Cleanup error:', error.message));
    } catch (error) {
        console.error('Cleanup trigger error:', error.message);
        if (!res.headersSent) return res.status(500).json({ error: 'Cleanup failed' });
    }
});

export default router;
