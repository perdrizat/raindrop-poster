import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const destination = req.body.destination || 'twitter';
        const { tweet1, tweet2 } = req.body;

        if (!tweet1 || !tweet2) {
            return res.status(400).json({ error: 'Both tweet1 and tweet2 content are required' });
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
                    }
                }
            `;

            let successCount = 0;
            const errors = [];

            for (const channelId of targetChannels) {
                try {
                    // Post the first idea
                    const res1 = await axios.post('https://api.buffer.com/1/graphql', {
                        query,
                        variables: {
                            input: {
                                channelId: channelId,
                                text: tweet1,
                                schedulingType: "automatic",
                                mode: "shareNext"
                            }
                        }
                    }, {
                        headers: {
                            'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (res1.data.errors) {
                        errors.push(`Channel ${channelId}: ${res1.data.errors[0].message}`);
                        continue; // Skip the second tweet for this channel if the first fails
                    }

                    // Post the second idea
                    const res2 = await axios.post('https://api.buffer.com/1/graphql', {
                        query,
                        variables: {
                            input: {
                                channelId: channelId,
                                text: tweet2,
                                schedulingType: "automatic",
                                mode: "shareNext"
                            }
                        }
                    }, {
                        headers: {
                            'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (res2.data.errors) {
                        errors.push(`Channel ${channelId} (Tweet 2): ${res2.data.errors[0].message}`);
                        continue;
                    }

                    successCount++;
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
                message: `Published to ${successCount} channel(s)`
            });

        } else {
            // Default to Twitter
            if (!req.session || !req.session.twitter || !req.session.twitter.accessToken) {
                return res.status(401).json({ error: 'Twitter connection required to publish' });
            }

            const client = new TwitterApi(req.session.twitter.accessToken);

            // Post the first tweet
            const firstTweetResponse = await client.v2.tweet(tweet1);

            // Post the second tweet as a reply
            await client.v2.tweet({
                text: tweet2,
                reply: {
                    in_reply_to_tweet_id: firstTweetResponse.data.id
                }
            });

            let url = `https://twitter.com/user/status/${firstTweetResponse.data.id}`;
            try {
                const me = await client.v2.me();
                url = `https://twitter.com/${me.data.username}/status/${firstTweetResponse.data.id}`;
            } catch (e) {
                console.warn("Could not fetch user ID for URL construction", e.message);
            }

            return res.json({ success: true, url: url });
        }
    } catch (error) {
        console.error('Publish Error:', error.response?.data || error.message || error);

        let errorMsg = 'Failed to publish thread';
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
