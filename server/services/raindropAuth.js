import axios from 'axios';
import { getSetting, setSetting } from './db.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

/**
 * Attempts to refresh the Raindrop.io access token using the stored refresh token.
 * Returns the new access token on success, or null on failure.
 */
export async function refreshRaindropToken() {
    const refreshToken = await getSetting('RAINDROPIO_REFRESH_TOKEN');
    const clientId = process.env.RAINDROPIO_CLIENT_ID || await getSetting('RAINDROPIO_CLIENT_ID');
    const clientSecret = process.env.RAINDROPIO_CLIENT_SECRET || await getSetting('RAINDROPIO_CLIENT_SECRET');

    if (!refreshToken || !clientId || !clientSecret) {
        console.warn('Cannot refresh Raindrop token: missing refresh_token or client credentials');
        return null;
    }

    try {
        const response = await axios.post('https://raindrop.io/oauth/access_token', {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
        });

        if (!response.data.access_token) {
            console.error('Raindrop token refresh returned no access_token:', response.data);
            return null;
        }

        // Persist new tokens
        await setSetting('RAINDROPIO_ACCESS_TOKEN', response.data.access_token);
        if (response.data.refresh_token) {
            await setSetting('RAINDROPIO_REFRESH_TOKEN', response.data.refresh_token);
        }
        if (response.data.expires_in) {
            await setSetting('RAINDROPIO_EXPIRES_AT', String(Date.now() + response.data.expires_in * 1000));
        }

        console.log('Raindrop.io token refreshed successfully');
        return response.data.access_token;
    } catch (error) {
        console.error('Raindrop token refresh failed:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Returns a valid Raindrop.io access token, refreshing proactively if near expiry.
 * Falls back to session token, then DB token.
 * Returns null if no valid token is available (caller should return 401).
 */
export async function getValidRaindropToken(req) {
    // 1. Try session token first (freshest)
    const sessionToken = req?.session?.raindropio?.accessToken;
    const sessionExpiry = req?.session?.raindropio?.expiresAt;

    if (sessionToken && sessionExpiry && sessionExpiry > Date.now() + REFRESH_MARGIN_MS) {
        return sessionToken;
    }

    // 2. Check DB token + expiry
    const dbToken = await getSetting('RAINDROPIO_ACCESS_TOKEN');
    const dbExpiresAt = await getSetting('RAINDROPIO_EXPIRES_AT');

    if (dbToken && dbExpiresAt) {
        const expiresAt = Number(dbExpiresAt);
        if (expiresAt > Date.now() + REFRESH_MARGIN_MS) {
            return dbToken;
        }
        // Token is near expiry or expired — try refresh
        console.log('Raindrop.io token near expiry, attempting refresh...');
        const newToken = await refreshRaindropToken();
        if (newToken) {
            // Update session too if available
            if (req?.session?.raindropio) {
                req.session.raindropio.accessToken = newToken;
                req.session.raindropio.expiresAt = Date.now() + 14 * 24 * 60 * 60 * 1000; // approximate
            }
            return newToken;
        }
        // Refresh failed but token might still work (not yet expired at the server)
        if (expiresAt > Date.now()) {
            return dbToken;
        }
        return null;
    }

    // 3. No expiry info — token exists but we don't know if it's valid
    //    Try to use it; if it fails, the caller's 401 retry will handle it
    if (dbToken) {
        return dbToken;
    }

    return null;
}

/**
 * Wraps a Raindrop API call with automatic 401 retry via token refresh.
 * @param {Function} apiCall - async function(token) that makes the API call
 * @param {object} req - Express request object
 * @returns {Promise<any>} The API response data
 * @throws {object} { status, message } on unrecoverable failure
 */
export async function withTokenRefresh(apiCall, req) {
    const token = await getValidRaindropToken(req);
    if (!token) {
        throw { status: 401, message: 'Raindrop.io authentication expired. Please reconnect in Settings.' };
    }

    try {
        return await apiCall(token);
    } catch (error) {
        if (error.response?.status === 401) {
            // Token rejected — try one refresh
            console.log('Raindrop API returned 401, attempting token refresh...');
            const newToken = await refreshRaindropToken();
            if (!newToken) {
                throw { status: 401, message: 'Raindrop.io authentication expired. Please reconnect in Settings.' };
            }
            // Update session
            if (req?.session?.raindropio) {
                req.session.raindropio.accessToken = newToken;
            }
            return await apiCall(newToken);
        }
        throw error;
    }
}
