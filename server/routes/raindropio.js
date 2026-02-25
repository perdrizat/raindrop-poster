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

export default router;
