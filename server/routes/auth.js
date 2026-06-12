import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { getSetting, setSetting, getConfig } from '../services/db.js';
import { testConnection } from '../services/imageHostService.js';

const router = express.Router();

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
        venice: !!(await getConfig('VENICE_API_KEY')),
        buffer: !!(await getConfig('BUFFER_ACCESS_TOKEN')),
        r2: !!(await getConfig('R2_ACCOUNT_ID')),
    });
});

// --- BUFFER API SMOKE TEST ---
router.get('/buffer/test', async (req, res) => {
    try {
        const token = await getConfig('BUFFER_ACCESS_TOKEN');
        const profileId = await getConfig('BUFFER_PROFILE_ID');

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

        console.log('Buffer API → GetChannels');
        const response = await axios.post('https://api.buffer.com/1/graphql', {
            query,
            variables: {
                input: {
                    organizationId: profileId
                }
            }
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.errors) {
            console.error(`Buffer API ✗ GetChannels: ${response.data.errors[0].message}`);
            return res.status(502).json({ error: response.data.errors[0].message });
        }

        const channels = response.data.data.channels;
        const services = [...new Set(channels.map(ch => ch.service))];
        console.log(`Buffer API ✓ ${channels.length} channels on ${services.join(', ')}`);
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

// --- CLOUDFLARE R2 TEST ---
router.get('/r2/test', async (req, res) => {
    try {
        console.log('R2 API → test connection');
        const result = await testConnection();
        console.log(`R2 API ✓ ${result.message}`);
        res.json(result);
    } catch (error) {
        const errMsg = error.message || 'Failed to connect to Cloudflare R2';
        console.error(`R2 API ✗ ${errMsg}`);
        res.status(502).json({ error: `R2 Error: ${errMsg}` });
    }
});


// --- INITIALIZE OAUTH FLOWS ---

router.get('/:provider', async (req, res) => {
    const { provider } = req.params;
    const state = generateState();
    req.session[`${provider}State`] = state; // Store state in session to verify on callback

    switch (provider) {
        case 'raindropio': {
            // Raindrop.io OAuth 2.0 (No PKCE required, standard auth code flow)
            const clientId = await getConfig('RAINDROPIO_CLIENT_ID');
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
        return res.status(400).json({ error: `OAuth Error: ${error}` });
    }

    if (!code) {
        return res.status(400).json({ error: 'OAuth Error: No authorization code returned' });
    }

    try {
        switch (provider) {
            case 'raindropio': {
                const storedState = req.session.raindropioState;
                if (state !== storedState) {
                    return res.status(400).json({ error: 'OAuth state mismatch.' });
                }

                let response;
                try {
                    const clientId = await getConfig('RAINDROPIO_CLIENT_ID');
                    const clientSecret = await getConfig('RAINDROPIO_CLIENT_SECRET');
                    const redirectUri = process.env.RAINDROPIO_REDIRECT_URI || `${getServerBaseUrl(req)}/api/auth/raindropio/callback`;

                    response = await axios.post('https://raindrop.io/oauth/access_token', {
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri
                    });
                } catch (rdError) {
                    // Detail goes to the server log only — provider payloads can contain
                    // client IDs and internals that must not reach the browser.
                    console.error('Raindrop Token Exchange Failed:', rdError.response?.data || rdError.message);
                    return res.status(401).json({ error: 'Raindrop OAuth failed. Check the server logs for details.' });
                }

                // Raindrop API might return 200 OK but with an error payload
                if (response.data.error || response.data.result === false) {
                    console.error('Raindrop Token Exchange Returned Error Payload:', response.data);
                    return res.status(401).json({ error: 'Raindrop OAuth failed. Check the server logs for details.' });
                }

                if (!response.data.access_token) {
                    console.error('Raindrop Token Exchange Missing Access Token. Keys received:', Object.keys(response.data));
                    return res.status(401).json({ error: 'Raindrop OAuth failed. Check the server logs for details.' });
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
                    if (response.data.expires_in) await setSetting('RAINDROPIO_EXPIRES_AT', String(Date.now() + response.data.expires_in * 1000));
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
        return res.status(500).json({ error: `Authentication failed for ${provider}. Check server logs for details.` });
    }
});

export default router;
