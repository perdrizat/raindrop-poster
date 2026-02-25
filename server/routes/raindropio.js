import express from 'express';
import axios from 'axios';

const router = express.Router();

router.get('/test', async (req, res) => {
    try {
        if (!req.session.raindropio || !req.session.raindropio.accessToken) {
            return res.status(401).json({ error: 'Not authenticated with Raindrop' });
        }

        const response = await axios.get('https://api.raindrop.io/rest/v1/user', {
            headers: {
                Authorization: `Bearer ${req.session.raindropio.accessToken}`
            }
        });

        res.json({ success: true, user: response.data.user.fullName || response.data.user.name });
    } catch (error) {
        console.error('Raindrop API Test Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to connect to Raindrop API' });
    }
});

// --- FETCH TAGS ---
router.get('/tags', async (req, res) => {
    try {
        if (!req.session.raindropio || !req.session.raindropio.accessToken) {
            return res.status(401).json({ error: 'Not authenticated with Raindrop' });
        }

        const response = await axios.get('https://api.raindrop.io/rest/v1/tags', {
            headers: {
                Authorization: `Bearer ${req.session.raindropio.accessToken}`
            }
        });

        // The Raindrop API returns tags under the 'items' key
        res.json({ success: true, tags: response.data.items });
    } catch (error) {
        console.error('Raindrop API Tags Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to fetch tags from Raindrop API' });
    }
});

// --- FETCH TAGGED ITEMS ---
router.get('/raindrops/0', async (req, res) => {
    try {
        if (!req.session.raindropio || !req.session.raindropio.accessToken) {
            return res.status(401).json({ error: 'Not authenticated with Raindrop' });
        }

        const queryParams = req.query.search ? `?search=${req.query.search}` : '';
        const url = `https://api.raindrop.io/rest/v1/raindrops/0${queryParams}`;

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${req.session.raindropio.accessToken}`
            }
        });

        res.json({ success: true, items: response.data.items });
    } catch (error) {
        console.error('Raindrop API Items Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to fetch items from Raindrop API' });
    }
});

export default router;
