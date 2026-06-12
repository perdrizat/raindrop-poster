import express from 'express';
import { scrapeArticle } from '../services/scraperService.js';
import { assertPublicHttpUrl } from '../services/urlGuard.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            await assertPublicHttpUrl(url);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        const { markdown, html } = await scrapeArticle(url);
        res.json({ markdown, html, text: markdown });

    } catch (error) {
        console.error("Scrape route error:", error);
        res.status(500).json({ error: 'Failed to scrape the article.' });
    }
});

export default router;
