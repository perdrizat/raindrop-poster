import express from 'express';
import { getSetting, setSetting, getConfig } from '../services/db.js';
import { getBufferRateLimit } from '../services/bufferService.js';

const router = express.Router();

// Latest Buffer rate-limit snapshot for the client quota banner. Returns the
// cached headers from the last Buffer call — this makes no Buffer request itself,
// so it's safe to poll without consuming quota.
router.get('/buffer-quota', (req, res) => {
    res.json({ rateLimit: getBufferRateLimit() });
});

// Persist a config value to SQLite and mirror it into process.env, skipping
// blanks so a partial form submission never wipes existing credentials.
const saveConfig = async (key, value) => {
    if (value && value.trim() !== '') {
        await setSetting(key, value.trim());
        process.env[key] = value.trim();
    }
};

/**
 * Validates if the most basic required keys exist to launch the app.
 * A user might only have Buffer configured, or only Venice configured.
 * But Raindrop.io is universally required to fetch content.
 */
const checkMinimumConfig = async () => {
    // These reads are independent — run them concurrently rather than serially,
    // since /status is hit on every page load.
    const [
        raindropId,
        veniceKey,
        bufferToken,
        r2AccountId,
        bufferProfileId,
        selectedTag,
        postingObjectives,
        bufferChannelsRaw,
    ] = await Promise.all([
        getConfig('RAINDROPIO_CLIENT_ID'),
        getConfig('VENICE_API_KEY'),
        getConfig('BUFFER_ACCESS_TOKEN'),
        getConfig('R2_ACCOUNT_ID'),
        getConfig('BUFFER_PROFILE_ID'),
        getSetting('SELECTED_TAG'),
        getSetting('POSTING_OBJECTIVES'),
        getSetting('BUFFER_CHANNELS'),
    ]);

    let bufferChannels = [];
    try { bufferChannels = bufferChannelsRaw ? JSON.parse(bufferChannelsRaw) : []; } catch { /* keep [] */ }

    const hasRaindropConfig = !!raindropId;
    return {
        isConfigured: hasRaindropConfig,
        hasRaindropConfig,
        hasVeniceConfig: !!veniceKey,
        hasBufferConfig: !!bufferToken,
        hasR2Config: !!r2AccountId,
        raindropClientId: raindropId || '',
        bufferProfileId: bufferProfileId || '',
        selectedTag: selectedTag || '',
        postingObjectives: postingObjectives || '',
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
            r2AccountId,
            r2AccessKeyId,
            r2SecretAccessKey,
            r2BucketName,
            r2PublicUrl,
            selectedTag,
            postingObjectives,
            bufferChannels,
        } = req.body;

        // Persist to SQLite & Update Memory concurrently if provided
        const secretConfig = {
            RAINDROPIO_CLIENT_ID: raindropClientId,
            RAINDROPIO_CLIENT_SECRET: raindropClientSecret,
            VENICE_API_KEY: veniceApiKey,
            BUFFER_ACCESS_TOKEN: bufferAccessToken,
            BUFFER_PROFILE_ID: bufferProfileId,
            R2_ACCOUNT_ID: r2AccountId,
            R2_ACCESS_KEY_ID: r2AccessKeyId,
            R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
            R2_BUCKET_NAME: r2BucketName,
            R2_PUBLIC_URL: r2PublicUrl,
        };
        const promises = Object.entries(secretConfig).map(([key, value]) => saveConfig(key, value));

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
