import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';

const router = express.Router();

// Helper to generate a code verifier for OAuth 2.0 PKCE (used by Twitter)
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

// Helper to generate a state parameter for CSRF protection
function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// --- GET CURRENT SESSION STATUS ---
router.get('/status', (req, res) => {
    res.json({
        twitter: !!req.session.twitter,
        raindropio: !!req.session.raindropio,
        venice: !!process.env.VENICE_API_KEY,
        buffer: !!process.env.BUFFER_ACCESS_TOKEN
    });
});

// --- TWITTER API SMOKE TEST ---
router.get('/twitter/test', async (req, res) => {
    try {
        if (!req.session.twitter || !req.session.twitter.accessToken) {
            return res.status(401).json({ error: 'Not authenticated with Twitter' });
        }

        const client = new TwitterApi(req.session.twitter.accessToken);
        const user = await client.v2.me();

        res.json({ success: true, username: user.data.username, name: user.data.name });
    } catch (error) {
        console.error('Twitter API Test Error:', error.data || error.message);
        res.status(502).json({ error: 'Failed to connect to Twitter API' });
    }
});

// --- BUFFER API SMOKE TEST ---
router.get('/buffer/test', async (req, res) => {
    try {
        if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_PROFILE_ID) {
            return res.status(401).json({ error: 'Not authenticated with Buffer' });
        }

        const query = `
            query GetChannels($input: ChannelsInput!) {
                channels(input: $input) {
                    id
                    service
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
                'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.errors) {
            return res.status(502).json({ error: response.data.errors[0].message });
        }

        res.json({ success: true, channelCount: response.data.data.channels.length });
    } catch (error) {
        const errMsg = error.response?.status === 500
            ? 'Buffer API returned 500. Your token might be deactivated or invalid.'
            : (error.response?.data?.error || error.response?.data?.message || 'Failed to connect to Buffer API');

        res.status(502).json({ error: errMsg });
    }
});

// --- INITIALIZE OAUTH FLOWS ---

router.get('/:provider', (req, res) => {
    const { provider } = req.params;
    const state = generateState();
    req.session[`${provider}State`] = state; // Store state in session to verify on callback

    switch (provider) {
        case 'twitter': {
            // Twitter OAuth 2.0 with PKCE
            const client = new TwitterApi({
                clientId: process.env.TWITTER_CLIENT_ID,
                clientSecret: process.env.TWITTER_CLIENT_SECRET,
            });

            const { url, codeVerifier, state: twitterState } = client.generateOAuth2AuthLink(
                process.env.TWITTER_REDIRECT_URI,
                { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
            );

            // Store the PKCE verifier and state in the session
            req.session.twitterVerifier = codeVerifier;
            req.session.twitterState = twitterState;

            return res.redirect(url);
        }

        case 'raindropio': {
            // Raindrop.io OAuth 2.0 (No PKCE required, standard auth code flow)
            const clientId = process.env.RAINDROPIO_CLIENT_ID;
            const redirectUri = encodeURIComponent(process.env.RAINDROPIO_REDIRECT_URI);
            const url = `https://raindrop.io/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;
            return res.redirect(url);
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
            case 'twitter': {
                const storedState = req.session.twitterState;
                const storedVerifier = req.session.twitterVerifier;

                if (!storedState || !storedVerifier || state !== storedState) {
                    return res.status(400).send('OAuth session mismatch or expired.');
                }

                const client = new TwitterApi({
                    clientId: process.env.TWITTER_CLIENT_ID,
                    clientSecret: process.env.TWITTER_CLIENT_SECRET,
                });

                // Exchange the authorization code for an access token
                const { client: loggedClient, accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
                    code: code.toString(),
                    codeVerifier: storedVerifier,
                    redirectUri: process.env.TWITTER_REDIRECT_URI,
                });

                // Store tokens in the user's session
                req.session.twitter = {
                    accessToken,
                    refreshToken,
                    expiresAt: Date.now() + (expiresIn * 1000)
                };

                // Redirect back to the frontend setup page
                return res.redirect('http://localhost:5173/setup?success=twitter');
            }

            case 'raindropio': {
                const storedState = req.session.raindropioState;
                if (state !== storedState) {
                    return res.status(400).send('OAuth state mismatch.');
                }

                let response;
                try {
                    response = await axios.post('https://raindrop.io/oauth/access_token', {
                        client_id: process.env.RAINDROPIO_CLIENT_ID,
                        client_secret: process.env.RAINDROPIO_CLIENT_SECRET,
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: process.env.RAINDROPIO_REDIRECT_URI
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

                return res.redirect('http://localhost:5173/setup?success=raindropio');
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
