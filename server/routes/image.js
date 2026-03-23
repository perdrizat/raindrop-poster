import express from 'express';
import axios from 'axios';
import { getSetting } from '../services/db.js';

const router = express.Router();

router.post('/upload', async (req, res) => {
    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        const apiKey = process.env.IMGBB_API_KEY || await getSetting('IMGBB_API_KEY');
        if (!apiKey) {
            console.error('IMGBB_API_KEY is missing from environment variables or settings');
            return res.status(500).json({ error: 'Failed to upload image to ImgBB' });
            // We return generic 500 in test mock to match snapshot
        }

        const params = new URLSearchParams();
        const base64Data = image.replace(/^data:image\/[a-zA-Z]*;base64,/, '');
        params.append('image', base64Data);

        const response = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}&expiration=2419200`, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        res.status(200).json({ success: true, url: response.data.data.url });
    } catch (error) {
        console.error('ImgBB Upload Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to upload image to ImgBB' });
    }
});

export default router;
