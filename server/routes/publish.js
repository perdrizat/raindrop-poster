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
            if (!process.env.BUFFER_ACCESS_TOKEN || !process.env.BUFFER_PROFILE_ID) {
                return res.status(401).json({ error: 'Buffer credentials not configured' });
            }

            // 1. Fetch channels to get the channel ID
            const queryChannels = `
                query GetChannels($input: ChannelsInput!) {
                    channels(input: $input) {
                        id
                    }
                }
            `;
            const channelsRes = await axios.post('https://api.buffer.com/1/graphql', {
                query: queryChannels,
                variables: {
                    input: { organizationId: process.env.BUFFER_PROFILE_ID }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (channelsRes.data.errors) {
                return res.status(502).json({ error: channelsRes.data.errors[0].message });
            }

            const channels = channelsRes.data?.data?.channels;
            if (!channels || channels.length === 0) {
                return res.status(404).json({ error: 'No Buffer channels found for this organization.' });
            }
            const targetChannelId = channels[0].id;

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

            // Post the first idea
            const res1 = await axios.post('https://api.buffer.com/1/graphql', {
                query,
                variables: {
                    input: {
                        channelId: targetChannelId,
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
                return res.status(502).json({ error: res1.data.errors[0].message });
            }

            // Post the second idea
            const res2 = await axios.post('https://api.buffer.com/1/graphql', {
                query,
                variables: {
                    input: {
                        channelId: targetChannelId,
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
                return res.status(502).json({ error: res2.data.errors[0].message });
            }

            return res.json({ success: true, url: 'https://publish.buffer.com/create' });

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
