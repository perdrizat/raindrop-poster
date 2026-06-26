import express from 'express';
import { getConfig, trackPostImage } from '../services/db.js';
import { uploadImage } from '../services/imageHostService.js';
import { bufferGraphql, CHANNELS_QUERY } from '../services/bufferService.js';
import { CHAR_LIMITS, SHORTENED_URL_LEN, URL_SHORTENED_SERVICES } from '../../shared/platformLimits.js';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const { text, articleUrl, imageData, coverUrl } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Post text is required' });
        }

        const { targetChannels, bufferMode = 'draft' } = req.body;

        const bufferAccessToken = await getConfig('BUFFER_ACCESS_TOKEN');
        const bufferProfileId = await getConfig('BUFFER_PROFILE_ID');

        if (!bufferAccessToken || !bufferProfileId) {
            return res.status(401).json({ error: 'Buffer credentials not configured' });
        }

        if (!targetChannels || !Array.isArray(targetChannels) || targetChannels.length === 0) {
            return res.status(400).json({ error: 'No target channels selected for Buffer.' });
        }

        // Fetch channel metadata to enforce per-platform character limits before posting.
        // Limits mirror the client (PostPage) exactly via shared/platformLimits.js: total
        // budget per platform, with the article URL weighted at a fixed 23 chars for
        // services that shorten URLs. Threads counts the full text.
        const urlShortenedServices = new Set(URL_SHORTENED_SERVICES);
        const channelsData = await bufferGraphql(bufferAccessToken, CHANNELS_QUERY, {
            input: { organizationId: bufferProfileId }
        });
        const allChannels = channelsData?.data?.channels || [];
        const channelServiceMap = Object.fromEntries(allChannels.map(ch => [ch.id, ch.service]));

        // Pre-validate effective text length against all target channels
        const violations = [];
        for (const channelId of targetChannels) {
            const service = channelServiceMap[channelId];
            if (!service || !CHAR_LIMITS[service]) continue;
            let textToCheck = text;
            if (urlShortenedServices.has(service) && articleUrl) {
                textToCheck = text.replace(articleUrl, 'x'.repeat(SHORTENED_URL_LEN));
            }
            if (textToCheck.length > CHAR_LIMITS[service]) {
                const label = service.charAt(0).toUpperCase() + service.slice(1);
                violations.push(`${label} posts cannot exceed ${CHAR_LIMITS[service]} characters (got ${textToCheck.length})`);
            }
        }
        if (violations.length > 0) {
            return res.status(400).json({ error: violations.join('; ') });
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
                    text,
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

                // Upload imageData to R2 or use coverUrl directly
                let imageUrl = null;
                let r2Key = null;
                if (imageData) {
                    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
                    const buffer = Buffer.from(base64Data, 'base64');
                    const uploaded = await uploadImage(buffer);
                    imageUrl = uploaded.url;
                    r2Key = uploaded.key;
                } else if (coverUrl) {
                    imageUrl = coverUrl;
                }

                if (imageUrl) {
                    input.assets = [{ image: { url: imageUrl } }];
                }

                console.log(`Buffer API → createPost channel=${channelId} mode=${input.mode} scheduling=${input.schedulingType}${input.saveToDraft ? ' draft=true' : ''}${imageUrl ? ' +image' : ''}`);

                const data = await bufferGraphql(bufferAccessToken, query, { input });

                if (data.errors) {
                    console.error(`Buffer API ✗ channel=${channelId}: ${data.errors[0].message}`);
                    errors.push(`Channel ${channelId}: ${data.errors[0].message}`);
                    continue;
                }

                const result = data.data?.createPost;
                if (result?.__typename === 'PostActionSuccess') {
                    console.log(`Buffer API ✓ channel=${channelId} postId=${result.post.id}`);
                    postedIds.push(result.post.id);
                    successCount++;
                    if (r2Key) {
                        await trackPostImage(result.post.id, r2Key, channelId);
                    }
                } else if (result?.__typename === 'InvalidInputError' || result?.__typename === 'UnexpectedError') {
                    console.error(`Buffer API ✗ channel=${channelId}: ${result.message}`);
                    errors.push(`Channel ${channelId}: ${result.message}`);
                } else {
                    console.log(`Buffer API ✓ channel=${channelId} (no post ID returned)`);
                    successCount++;
                }
            } catch (e) {
                console.error(`Error posting to channel ${channelId}:`, e.message);
                errors.push(`Channel ${channelId}: ${e.message}`);
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

        const result = {
            success: true,
            url: 'https://publish.buffer.com/all-channels',
            message: `Published to ${successCount} channel(s)`,
            postedIds,
        };
        if (errors.length > 0) {
            result.partialErrors = errors;
        }
        return res.json(result);
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
