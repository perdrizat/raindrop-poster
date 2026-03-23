import express from 'express';
import axios from 'axios';
import { getSetting } from '../services/db.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { text, articleUrl, screenshotUrl } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Post text is required' });
        }

        const { targetChannels, bufferMode = 'draft' } = req.body;

        const bufferAccessToken = process.env.BUFFER_ACCESS_TOKEN || await getSetting('BUFFER_ACCESS_TOKEN');
        const bufferProfileId = process.env.BUFFER_PROFILE_ID || await getSetting('BUFFER_PROFILE_ID');

        if (!bufferAccessToken || !bufferProfileId) {
            return res.status(401).json({ error: 'Buffer credentials not configured' });
        }

        if (!targetChannels || !Array.isArray(targetChannels) || targetChannels.length === 0) {
            return res.status(400).json({ error: 'No target channels selected for Buffer.' });
        }

        const query = `
                mutation CreatePost($input: CreatePostInput!) {
                    createPost(input: $input) {
                        __typename
                        ... on PostActionSuccess {
                            post { id }
                        }
                        ... on InvalidInputError {
                            message
                        }
                        ... on UnexpectedError {
                            message
                        }
                    }
                }
            `;

        let successCount = 0;
        const errors = [];
        const postedIds = [];

        for (const channelId of targetChannels) {
            try {
                const input = {
                    channelId: channelId,
                    text: text,
                };

                // Buffer GraphQL API requires both schedulingType and mode:
                //   schedulingType: 'automatic' | 'notification'
                //   mode: 'shareNow' | 'shareNext' | 'addToQueue' | 'customScheduled' | 'recommendedTime'
                //   saveToDraft (optional): only sent as true for drafts
                input.schedulingType = 'automatic';
                switch (bufferMode) {
                    case 'now':
                        input.mode = 'shareNow';
                        break;
                    case 'prioritize':
                        input.mode = 'shareNext';
                        break;
                    case 'next':
                        input.mode = 'addToQueue';
                        break;
                    case 'draft':
                    default:
                        input.mode = 'addToQueue';
                        input.saveToDraft = true;
                        break;
                }

                // Attach image if screenshot URL is provided
                if (screenshotUrl) {
                    input.assets = {
                        images: [{ url: screenshotUrl }]
                    };
                }

                console.log(`Buffer API → createPost channel=${channelId} mode=${input.mode} scheduling=${input.schedulingType}${input.saveToDraft ? ' draft=true' : ''}${screenshotUrl ? ' +image' : ''}`);

                const response = await axios.post('https://api.buffer.com/1/graphql', {
                    query,
                    variables: { input }
                }, {
                    headers: {
                        'Authorization': `Bearer ${bufferAccessToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.errors) {
                    console.error(`Buffer API ✗ channel=${channelId}: ${response.data.errors[0].message}`);
                    errors.push(`Channel ${channelId}: ${response.data.errors[0].message}`);
                    continue;
                }

                const result = response.data.data?.createPost;
                if (result?.__typename === 'PostActionSuccess') {
                    console.log(`Buffer API ✓ channel=${channelId} postId=${result.post.id}`);
                    postedIds.push(result.post.id);
                    successCount++;
                } else if (result?.__typename === 'InvalidInputError' || result?.__typename === 'UnexpectedError') {
                    console.error(`Buffer API ✗ channel=${channelId}: ${result.message}`);
                    errors.push(`Channel ${channelId}: ${result.message}`);
                } else {
                    console.log(`Buffer API ✓ channel=${channelId} (no post ID returned)`);
                    successCount++;
                }
            } catch (e) {
                console.error(`Error posting to channel ${channelId}:`, e.message);
                errors.push(`Channel ${channelId} threw an exception.`);
            }
        }

        if (successCount === 0) {
            return res.status(502).json({
                error: `Failed to publish to Buffer. Errors: ${errors.join(' | ')}`
            });
        }

        if (errors.length > 0) {
            console.warn(`Buffer multi-post completed with partial failures:`, errors);
        }

        return res.json({
            success: true,
            url: 'https://publish.buffer.com/all-channels',
            message: `Published to ${successCount} channel(s)`,
            postedIds
        });
    } catch (error) {
        console.error('Publish Error:', error.response?.data || error.message || error);

        let errorMsg = 'Failed to publish post';
        if (error.response?.status === 500) {
            errorMsg = 'Destination API returned 500. Your token might be deactivated.';
        } else if (error.response?.data?.error) {
            errorMsg = error.response.data.error;
        } else if (error.response?.data?.message) {
            errorMsg = error.response.data.message;
        }
        res.status(502).json({ error: errorMsg });
    }
});

export default router;
