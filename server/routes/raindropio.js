import express from 'express';
import axios from 'axios';
import { withTokenRefresh } from '../services/raindropAuth.js';

const router = express.Router();

// Issues a Raindrop API call with a refreshed bearer token, returning response.data.
const raindropRequest = (req, { method, url, data }) =>
    withTokenRefresh(async (token) => {
        // 15s ceiling so a stalled Raindrop call can't hang the request forever.
        const options = { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 };
        const response = data === undefined
            ? await axios[method](url, options)
            : await axios[method](url, data, options);
        return response.data;
    }, req);

// Translates a Raindrop API failure into the right HTTP response: 401 passes the
// auth error through, everything else is a 502 with a route-specific message.
const sendRaindropError = (error, res, context, failMessage) => {
    if (error.status === 401) {
        return res.status(401).json({ error: error.message });
    }
    console.error(`Raindrop API ✗ ${context}:`, error.response?.data || error.message);
    res.status(502).json({ error: failMessage });
};

router.get('/test', async (req, res) => {
    try {
        console.log('Raindrop API → GET /rest/v1/user');
        const data = await raindropRequest(req, { method: 'get', url: 'https://api.raindrop.io/rest/v1/user' });

        const userName = data.user.fullName || data.user.name;
        console.log(`Raindrop API ✓ user=${userName}`);

        const result = { success: true, user: userName };

        // Fetch bookmark stats (graceful — don't fail the test if this errors)
        try {
            const stats = await raindropRequest(req, { method: 'get', url: 'https://api.raindrop.io/rest/v1/user/stats' });
            const totalBookmarks = (stats.items || []).reduce((sum, col) => sum + (col.count || 0), 0);
            result.bookmarkCount = totalBookmarks;
            console.log(`Raindrop API ✓ ${totalBookmarks} bookmarks`);
        } catch (e) {
            console.warn('Raindrop API: could not fetch stats:', e.message);
        }

        res.json(result);
    } catch (error) {
        sendRaindropError(error, res, 'GET /rest/v1/user', 'Failed to connect to Raindrop API');
    }
});

// --- FETCH TAGS ---
router.get('/tags', async (req, res) => {
    try {
        console.log('Raindrop API → GET /rest/v1/tags');
        const data = await raindropRequest(req, { method: 'get', url: 'https://api.raindrop.io/rest/v1/tags' });

        console.log(`Raindrop API ✓ ${data.items?.length ?? 0} tags`);
        res.json({ success: true, tags: data.items });
    } catch (error) {
        sendRaindropError(error, res, 'GET /rest/v1/tags', 'Failed to fetch tags from Raindrop API');
    }
});

// --- FETCH TAGGED ITEMS ---
router.get('/raindrops/0', async (req, res) => {
    try {
        const queryParams = req.query.search ? `?search=${req.query.search}` : '';
        const url = `https://api.raindrop.io/rest/v1/raindrops/0${queryParams}`;

        console.log(`Raindrop API → GET /rest/v1/raindrops/0${queryParams}`);
        const data = await raindropRequest(req, { method: 'get', url });

        console.log(`Raindrop API ✓ ${data.items?.length ?? 0} items`);
        res.json({ success: true, items: data.items });
    } catch (error) {
        sendRaindropError(error, res, 'GET /rest/v1/raindrops/0', 'Failed to fetch items from Raindrop API');
    }
});

// --- UPDATE BOOKMARK TAGS ---
router.put('/bookmark/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tags } = req.body;

        console.log(`Raindrop API → PUT /rest/v1/raindrop/${id} tags=[${tags.join(', ')}]`);
        const data = await raindropRequest(req, {
            method: 'put',
            url: `https://api.raindrop.io/rest/v1/raindrop/${id}`,
            data: { tags },
        });

        console.log(`Raindrop API ✓ updated bookmark ${id}`);
        res.json({ success: true, item: data.item });
    } catch (error) {
        sendRaindropError(error, res, `PUT /rest/v1/raindrop/${req.params.id}`, 'Failed to update bookmark in Raindrop API');
    }
});

export default router;
