import express from 'express';
import axios from 'axios';
import { withTokenRefresh } from '../services/raindropAuth.js';

const router = express.Router();

router.get('/test', async (req, res) => {
    try {
        console.log('Raindrop API → GET /rest/v1/user');
        const data = await withTokenRefresh(async (token) => {
            const response = await axios.get('https://api.raindrop.io/rest/v1/user', {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        }, req);

        const userName = data.user.fullName || data.user.name;
        console.log(`Raindrop API ✓ user=${userName}`);

        const result = { success: true, user: userName };

        // Fetch bookmark stats (graceful — don't fail the test if this errors)
        try {
            const stats = await withTokenRefresh(async (token) => {
                const response = await axios.get('https://api.raindrop.io/rest/v1/user/stats', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                return response.data;
            }, req);
            const totalBookmarks = (stats.items || []).reduce((sum, col) => sum + (col.count || 0), 0);
            result.bookmarkCount = totalBookmarks;
            console.log(`Raindrop API ✓ ${totalBookmarks} bookmarks`);
        } catch (e) {
            console.warn('Raindrop API: could not fetch stats:', e.message);
        }

        res.json(result);
    } catch (error) {
        if (error.status === 401) {
            return res.status(401).json({ error: error.message });
        }
        console.error('Raindrop API ✗ GET /rest/v1/user:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to connect to Raindrop API' });
    }
});

// --- FETCH TAGS ---
router.get('/tags', async (req, res) => {
    try {
        console.log('Raindrop API → GET /rest/v1/tags');
        const data = await withTokenRefresh(async (token) => {
            const response = await axios.get('https://api.raindrop.io/rest/v1/tags', {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        }, req);

        console.log(`Raindrop API ✓ ${data.items?.length ?? 0} tags`);
        res.json({ success: true, tags: data.items });
    } catch (error) {
        if (error.status === 401) {
            return res.status(401).json({ error: error.message });
        }
        console.error('Raindrop API ✗ GET /rest/v1/tags:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to fetch tags from Raindrop API' });
    }
});

// --- FETCH TAGGED ITEMS ---
router.get('/raindrops/0', async (req, res) => {
    try {
        const queryParams = req.query.search ? `?search=${req.query.search}` : '';
        const url = `https://api.raindrop.io/rest/v1/raindrops/0${queryParams}`;

        console.log(`Raindrop API → GET /rest/v1/raindrops/0${queryParams}`);
        const data = await withTokenRefresh(async (token) => {
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        }, req);

        console.log(`Raindrop API ✓ ${data.items?.length ?? 0} items`);
        res.json({ success: true, items: data.items });
    } catch (error) {
        if (error.status === 401) {
            return res.status(401).json({ error: error.message });
        }
        console.error('Raindrop API ✗ GET /rest/v1/raindrops/0:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to fetch items from Raindrop API' });
    }
});

// --- UPDATE BOOKMARK TAGS ---
router.put('/bookmark/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tags } = req.body;

        console.log(`Raindrop API → PUT /rest/v1/raindrop/${id} tags=[${tags.join(', ')}]`);
        const data = await withTokenRefresh(async (token) => {
            const response = await axios.put(`https://api.raindrop.io/rest/v1/raindrop/${id}`, { tags }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        }, req);

        console.log(`Raindrop API ✓ updated bookmark ${id}`);
        res.json({ success: true, item: data.item });
    } catch (error) {
        if (error.status === 401) {
            return res.status(401).json({ error: error.message });
        }
        console.error(`Raindrop API ✗ PUT /rest/v1/raindrop/${req.params.id}:`, error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to update bookmark in Raindrop API' });
    }
});

export default router;
