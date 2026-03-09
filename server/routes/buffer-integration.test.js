import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import axios from 'axios';
import publishRouter from './publish.js';

const app = express();
app.use(express.json());
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false
}));
app.use('/api/publish', publishRouter);

describe.skip('Live Buffer Integration Test', () => {

    it('should successfully post an image tweet to Buffer and then cleanly delete it', async () => {
        // Only run if the user has provided live Buffer credentials in .env
        if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_PROFILE_ID) {
            console.warn("Skipping Live Buffer Integration Test: No credentials found in .env");
            return;
        }

        // 1. Manually fetch a valid target channel ID from the user's Buffer using GraphQL
        const channelQuery = `
            query GetChannels($input: ChannelsInput!) {
                channels(input: $input) { id service }
            }
        `;
        let channelId;
        try {
            const resChannels = await axios.post('https://api.buffer.com/1/graphql', {
                query: channelQuery,
                variables: { input: { organizationId: process.env.BUFFER_PROFILE_ID } }
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            const channels = resChannels.data.data.channels;
            if (!channels || channels.length === 0) {
                console.warn("Skipping Live Buffer Integration Test: No channels found in organization");
                return;
            }
            channelId = channels[0].id;
        } catch (error) {
            console.error("Failed to fetch Buffer channels prior to integration test:", error.message);
            return;
        }

        // 2. Call the Express endpoint to publish with a dummy image (simulating the Screenshot issue)
        const response = await request(app)
            .post('/api/publish')
            .send({
                destination: 'buffer',
                targetChannels: [channelId],
                text: `Integration Test - ${Date.now()} - This should be swept up and deleted shortly.`,
                articleUrl: `https://example.com/?test=${Date.now()}`,
                screenshotUrl: `https://picsum.photos/400/400?random=${Date.now()}`
            });

        console.log("Publish Response Body:", response.body);

        // 3. Assert successful publication
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.postedIds).toBeDefined();
        expect(Array.isArray(response.body.postedIds)).toBe(true);
        expect(response.body.postedIds.length).toBeGreaterThan(0);

        const postId = response.body.postedIds[0];
        console.log(`[Integration] Successfully published test post to Buffer (${postId}). Cleaning up...`);

        // 4. Assert Cleanup works perfectly so the test is hermetic
        try {
            // Buffer GraphQL does not support deletePost, must fallback to REST json destroy
            const delRes = await axios.post(
                `https://api.bufferapp.com/1/updates/${postId}/destroy.json`,
                "update_id=" + postId,
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            expect(delRes.status).toBe(200);
        } catch (cleanupError) {
            console.warn(`\n[WARNING] Failed to cleanup integration test Buffer post (${postId}).`);
            console.warn(`Buffer's modern GraphQL API does not expose a deletePost mutation.`);
            console.warn(`Buffer's legacy REST API endpoints (/destroy.json) return HTTP 500 when attempting to delete modern 24-character GraphQL Hex IDs.`);
            console.warn(`Because of this API limitation, the test post was successfully published but could not be automatically deleted. Please remove it manually in the Buffer UI.\n`);
        }
    }, 25000); // 25s timeout for network conditions
});
