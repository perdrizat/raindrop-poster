import express from 'express';
import { getSetting } from '../services/db.js';
import { shouldRunCleanup, runCleanup } from '../services/cleanupService.js';

const router = express.Router();

router.get('/trigger', async (req, res) => {
    try {
        const due = await shouldRunCleanup();
        if (!due) {
            return res.json({ skipped: true, reason: 'Not due yet' });
        }

        const bufferAccessToken = process.env.BUFFER_ACCESS_TOKEN || await getSetting('BUFFER_ACCESS_TOKEN');
        if (!bufferAccessToken) {
            return res.json({ skipped: true, reason: 'No Buffer token' });
        }

        const result = await runCleanup(bufferAccessToken);
        console.log(`Cleanup completed: checked=${result.checked} cleaned=${result.cleaned}`);
        return res.json({ result });
    } catch (error) {
        console.error('Cleanup trigger error:', error.message);
        return res.status(500).json({ error: 'Cleanup failed' });
    }
});

export default router;
