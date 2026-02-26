import express from 'express';
import { scrapeArticle } from '../services/scraperService.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            new URL(url);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        const text = await scrapeArticle(url);
        res.json({ text });

    } catch (error) {
        console.error("Scrape route error:", error);
        res.status(500).json({ error: 'Failed to scrape the article.' });
    }
});

export default router;
