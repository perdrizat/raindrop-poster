import express from 'express';
import axios from 'axios';

const router = express.Router();

router.get('/test', async (req, res) => {
    try {
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
            return res.status(401).json({ error: 'System VENICE_API_KEY is not configured' });
        }

        const response = await axios.get('https://api.venice.ai/api/v1/models', {
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
        });

        // The exact structure of Venice API response may vary, returning a boolean indicating success
        // or a list of the models returned for visual verification.
        const models = response.data.data || response.data;
        res.json({ success: true, modelsCount: Array.isArray(models) ? models.length : 'unknown', message: 'Successfully connected to Venice AI' });
    } catch (error) {
        console.error('Venice API Test Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to connect to Venice AI API' });
    }
});

export default router;
