import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { getSetting, setSetting } from '../services/db.js';

const router = express.Router();

// Helper to generate a code verifier for OAuth 2.0 PKCE (used by Twitter)
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

// Helper to generate a state parameter for CSRF protection
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// Helper to determine the base URL of the server dynamically based on the request.
// In dev, it might be localhost:3001 or localhost:8080. In prod, it's the real domain.
function getServerBaseUrl(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host; // e.g., 'localhost:8080' or 'example.com'
    return `${protocol}://${host}`;
}

// Helper to determine where to redirect the user after successful login
function getFrontendRedirectUrl(req) {
    // In production, the backend and frontend are served from the same domain
    if (process.env.NODE_ENV === 'production') {
        return `${getServerBaseUrl(req)}/setup`;
    }
    // In dev, the Vite frontend is usually on 5173
    return 'http://localhost:5173/setup';
}

// --- GET CURRENT SESSION STATUS ---
router.get('/status', async (req, res) => {
    res.json({
        raindropio: !!(req.session.raindropio || await getSetting('RAINDROPIO_ACCESS_TOKEN')),
        venice: !!(process.env.VENICE_API_KEY || await getSetting('VENICE_API_KEY')),
        buffer: !!(process.env.BUFFER_ACCESS_TOKEN || await getSetting('BUFFER_ACCESS_TOKEN')),
        imgbb: !!(process.env.IMGBB_API_KEY || await getSetting('IMGBB_API_KEY')),
    });
});

// --- BUFFER API SMOKE TEST ---
router.get('/buffer/test', async (req, res) => {
    try {
        const token = process.env.BUFFER_ACCESS_TOKEN || await getSetting('BUFFER_ACCESS_TOKEN');
        const profileId = process.env.BUFFER_PROFILE_ID || await getSetting('BUFFER_PROFILE_ID');

        if (!token || !profileId) {
            return res.status(401).json({ error: 'Not authenticated with Buffer' });
        }

        const query = `
            query GetChannels($input: ChannelsInput!) {
                channels(input: $input) {
                    id
                    service
                    name
                }
            }
        `;

        const response = await axios.post('https://api.buffer.com/1/graphql', {
            query,
            variables: {
                input: {
                    organizationId: process.env.BUFFER_PROFILE_ID
                }
            }
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.errors) {
            return res.status(502).json({ error: response.data.errors[0].message });
        }

        const channels = response.data.data.channels;
        const services = [...new Set(channels.map(ch => ch.service))];
        res.json({
            success: true,
            channels,
            channelCount: channels.length,
            services: services.join(', '),
        });
    } catch (error) {
        const errMsg = error.response?.status === 500
            ? 'Buffer API returned 500. Your token might be deactivated or invalid.'
            : (error.response?.data?.error || error.response?.data?.message || 'Failed to connect to Buffer API');

        res.status(502).json({ error: errMsg });
    }
});

// --- IMGBB API KEY ---
router.post('/imgbb/key', async (req, res) => {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'API key is required' });
    }
    await setSetting('IMGBB_API_KEY', apiKey.trim());
    process.env.IMGBB_API_KEY = apiKey.trim();
    res.json({ success: true });
});

router.get('/imgbb/test', async (req, res) => {
    const key = process.env.IMGBB_API_KEY || await getSetting('IMGBB_API_KEY');
    if (!key) {
        return res.status(401).json({ error: 'ImgBB API key not configured' });
    }
    res.json({ success: true, message: 'ImgBB API key is configured' });
});


// --- INITIALIZE OAUTH FLOWS ---

router.get('/:provider', async (req, res) => {
    const { provider } = req.params;
    const state = generateState();
    req.session[`${provider}State`] = state; // Store state in session to verify on callback

    switch (provider) {
        case 'raindropio': {
            // Raindrop.io OAuth 2.0 (No PKCE required, standard auth code flow)
            const clientId = process.env.RAINDROPIO_CLIENT_ID || await getSetting('RAINDROPIO_CLIENT_ID');
            const redirectUri = encodeURIComponent(process.env.RAINDROPIO_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/raindropio/callback`);
            const url = `https://raindrop.io/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

            return req.session.save(() => {
                res.redirect(url);
            });
        }

        default:
            return res.status(400).json({ error: 'Unknown OAuth provider' });
    }
});


// --- HANDLE OAUTH CALLBACKS ---

router.get('/:provider/callback', async (req, res) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send(`OAuth Error: ${error}`);
    }

    if (!code) {
        return res.status(400).send('OAuth Error: No authorization code returned');
    }

    try {
        switch (provider) {
            case 'raindropio': {
                const storedState = req.session.raindropioState;
                if (state !== storedState) {
                    return res.status(400).send('OAuth state mismatch.');
                }

                let response;
                try {
                    const clientId = process.env.RAINDROPIO_CLIENT_ID || await getSetting('RAINDROPIO_CLIENT_ID');
                    const clientSecret = process.env.RAINDROPIO_CLIENT_SECRET || await getSetting('RAINDROPIO_CLIENT_SECRET');
                    const redirectUri = process.env.RAINDROPIO_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/raindropio/callback`;

                    response = await axios.post('https://raindrop.io/oauth/access_token', {
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri
                    });
                    console.log("RAINDROP RESPONSE", response.data);
                } catch (rdError) {
                    console.error('Raindrop Token Exchange Failed:', rdError.response?.data || rdError.message);
                    return res.status(401).send(`Raindrop OAuth failed: ${JSON.stringify(rdError.response?.data || rdError.message)}`);
                }

                // Raindrop API might return 200 OK but with an error payload
                if (response.data.error || response.data.result === false) {
                    console.error('Raindrop Token Exchange Returned Error Payload:', response.data);
                    return res.status(401).send(`Raindrop OAuth failed with payload: ${JSON.stringify(response.data)}`);
                }

                if (!response.data.access_token) {
                    console.error('Raindrop Token Exchange Missing Access Token:', response.data);
                    return res.status(401).send(`Raindrop OAuth failed: Missing access_token in response: ${JSON.stringify(response.data)}`);
                }

                req.session.raindropio = {
                    accessToken: response.data.access_token,
                    refreshToken: response.data.refresh_token,
                    expiresAt: Date.now() + (response.data.expires_in * 1000)
                };

                // Store globally in Settings for single-user persistence
                try {
                    console.log('Attempting to save RAINDROPIO_ACCESS_TOKEN to global Settings...');
                    await setSetting('RAINDROPIO_ACCESS_TOKEN', response.data.access_token);
                    if (response.data.refresh_token) await setSetting('RAINDROPIO_REFRESH_TOKEN', response.data.refresh_token);
                    console.log('Successfully saved RAINDROPIO_ACCESS_TOKEN');
                } catch (dbErr) {
                    console.error('CRITICAL: Failed to save Raindrop tokens to global Settings', dbErr);
                }

                return req.session.save(() => {
                    res.redirect(`${getFrontendRedirectUrl(req)}?success=raindropio`);
                });
            }

            default:
                return res.status(400).json({ error: 'Unknown callback provider' });
        }
    } catch (err) {
        console.error(`Error during ${provider} OAuth:`, err.response?.data || err.message);
        return res.status(500).send(`Authentication failed for ${provider}. Check server logs for details.`);
    }
});

export default router;
