import express from 'express';
import { getSetting, setSetting } from '../services/db.js';

const router = express.Router();

/**
 * Validates if the most basic required keys exist to launch the app.
 * A user might only have Twitter configured, or only Buffer configured.
 * But Raindrop.io is universally required to fetch content.
 */
const checkMinimumConfig = async () => {
    const raindropId = process.env.RAINDROPIO_CLIENT_ID || await getSetting('RAINDROPIO_CLIENT_ID');
    const hasRaindropConfig = !!raindropId;

    const bufferChannelsRaw = await getSetting('BUFFER_CHANNELS');
    let bufferChannels = [];
    try { bufferChannels = bufferChannelsRaw ? JSON.parse(bufferChannelsRaw) : []; } catch { /* keep [] */ }

    return {
        isConfigured: hasRaindropConfig,
        hasRaindropConfig,
        hasVeniceConfig: !!(process.env.VENICE_API_KEY || await getSetting('VENICE_API_KEY')),
        hasBufferConfig: !!(process.env.BUFFER_ACCESS_TOKEN || await getSetting('BUFFER_ACCESS_TOKEN')),
        hasImgbbConfig: !!(process.env.IMGBB_API_KEY || await getSetting('IMGBB_API_KEY')),
        raindropClientId: raindropId || '',
        bufferProfileId: process.env.BUFFER_PROFILE_ID || await getSetting('BUFFER_PROFILE_ID') || '',
        selectedTag: await getSetting('SELECTED_TAG') || '',
        postingObjectives: await getSetting('POSTING_OBJECTIVES') || '',
        bufferChannels,
    };
};

router.get('/status', async (req, res) => {
    try {
        const status = await checkMinimumConfig();
        res.json(status);
    } catch (error) {
        console.error('Error checking system status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/configure', async (req, res) => {
    try {
        const {
            raindropClientId,
            raindropClientSecret,
            veniceApiKey,
            bufferAccessToken,
            bufferProfileId,
            imgbbApiKey,
            selectedTag,
            postingObjectives,
            bufferChannels,
        } = req.body;

        // Persist to SQLite & Update Memory concurrently if provided
        const saveConfig = async (key, value) => {
            if (value && value.trim() !== '') {
                await setSetting(key, value.trim());
                process.env[key] = value.trim();
            }
        };

        const promises = [
            saveConfig('RAINDROPIO_CLIENT_ID', raindropClientId),
            saveConfig('RAINDROPIO_CLIENT_SECRET', raindropClientSecret),
            saveConfig('VENICE_API_KEY', veniceApiKey),
            saveConfig('BUFFER_ACCESS_TOKEN', bufferAccessToken),
            saveConfig('BUFFER_PROFILE_ID', bufferProfileId),
            saveConfig('IMGBB_API_KEY', imgbbApiKey),
        ];

        // User workflow preferences — always overwrite (empty string is valid)
        if (typeof selectedTag === 'string') promises.push(setSetting('SELECTED_TAG', selectedTag));
        if (typeof postingObjectives === 'string') promises.push(setSetting('POSTING_OBJECTIVES', postingObjectives));
        if (Array.isArray(bufferChannels)) promises.push(setSetting('BUFFER_CHANNELS', JSON.stringify(bufferChannels)));

        await Promise.all(promises);

        res.json({ success: true, message: 'Configuration saved successfully.' });
    } catch (error) {
        console.error('Error saving system configuration:', error);
        res.status(500).json({ error: 'Failed to save configuration.' });
    }
});

export default router;
