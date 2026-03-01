import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const destination = req.body.destination || 'twitter';
        const { text, articleUrl, screenshotUrl } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Post text is required' });
        }

        if (destination === 'buffer') {
            const { targetChannels } = req.body;

            if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_PROFILE_ID) {
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
                        schedulingType: "automatic",
                        mode: "shareNext"
                    };

                    // Attach image if screenshot URL is provided
                    if (screenshotUrl) {
                        input.assets = {
                            images: [{ url: screenshotUrl }]
                        };
                    }

                    const response = await axios.post('https://api.buffer.com/1/graphql', {
                        query,
                        variables: { input }
                    }, {
                        headers: {
                            'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.errors) {
                        errors.push(`Channel ${channelId}: ${response.data.errors[0].message}`);
                        continue;
                    }

                    if (response.data.data?.createPost?.__typename === 'PostActionSuccess') {
                        postedIds.push(response.data.data.createPost.post.id);
                        successCount++;
                    } else if (response.data.data?.createPost?.__typename === 'InvalidInputError' || response.data.data?.createPost?.__typename === 'UnexpectedError') {
                        errors.push(`Channel ${channelId}: ${response.data.data.createPost.message}`);
                    } else {
                        console.log("FALLBACK RESPONSE:", JSON.stringify(response.data.data, null, 2));
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

        } else {
            // Default to Twitter
            if (!req.session || !req.session.twitter || !req.session.twitter.accessToken) {
                return res.status(401).json({ error: 'Twitter connection required to publish' });
            }

            const client = new TwitterApi(req.session.twitter.accessToken);

            // Post a single tweet
            const tweetResponse = await client.v2.tweet(text);

            let url = `https://twitter.com/user/status/${tweetResponse.data.id}`;
            try {
                const me = await client.v2.me();
                url = `https://twitter.com/${me.data.username}/status/${tweetResponse.data.id}`;
            } catch (e) {
                console.warn("Could not fetch user ID for URL construction", e.message);
            }

            return res.json({ success: true, url: url });
        }
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
