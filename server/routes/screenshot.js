import express from 'express';
import { captureQuoteScreenshot } from '../services/screenshotService.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { url, quoteText, author, date, domain: reqDomain, coverImageUrl } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Extract domain from URL or use provided domain
        let domain = reqDomain;
        if (domain === null || typeof domain === 'undefined') {
            try {
                domain = new URL(url).hostname.replace('www.', '');
            } catch {
                domain = '';
            }
        }

        const attribution = { author: author || null, date: date || null, domain };

        console.log(`Screenshot → ${url}${quoteText ? ` quote="${quoteText.slice(0, 50)}..."` : ''}`);
        const result = await captureQuoteScreenshot(
            url,
            quoteText || null,
            attribution,
            coverImageUrl || undefined
        );

        // If result is a string, it's already a public URL (cover image shortcut)
        if (typeof result === 'string') {
            console.log(`Screenshot ✓ cover image shortcut: ${result}`);
            return res.json({ coverUrl: result });
        }

        // Otherwise it's a Buffer — return as base64 data URL (no upload)
        const base64 = result.toString('base64');
        console.log(`Screenshot ✓ captured ${Math.round(base64.length / 1024)}KB base64`);
        return res.json({ imageData: `data:image/png;base64,${base64}` });

    } catch (error) {
        console.error('Screenshot route error:', error.message);
        res.status(500).json({ error: 'Failed to capture screenshot' });
    }
});

export default router;
