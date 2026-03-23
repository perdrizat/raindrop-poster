import express from 'express';
import { captureQuoteScreenshot } from '../services/screenshotService.js';
import { uploadImage } from '../services/imageHostService.js';

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
            return res.json({ screenshotUrl: result });
        }

        // Otherwise it's a Buffer — upload to image host
        const { url: imageUrl } = await uploadImage(result);
        console.log(`Screenshot ✓ uploaded: ${imageUrl}`);
        return res.json({ screenshotUrl: imageUrl });

    } catch (error) {
        console.error('Screenshot route error:', error.message);
        res.status(500).json({ error: 'Failed to capture or upload screenshot' });
    }
});

export default router;
