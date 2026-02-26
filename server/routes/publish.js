import express from 'express';
import { TwitterApi } from 'twitter-api-v2';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        if (!req.session.twitter || !req.session.twitter.accessToken) {
            return res.status(401).json({ error: 'Twitter connection required to publish' });
        }

        const { tweet1, tweet2 } = req.body;

        if (!tweet1 || !tweet2) {
            return res.status(400).json({ error: 'Both tweet1 and tweet2 content are required' });
        }

        const client = new TwitterApi(req.session.twitter.accessToken);

        // For the sake of testing, if we receive our mock tokens, we intercept the API calls
        // In a real testing environment, the TwitterApi would be fully mocked via vitest outside this file,
        // but vitest module mocking requires hoisting which can be tricky in some ESM setups.
        // We'll proceed with standard implementation. Vitest mocks in the test file should intercept if set up correctly.

        // Post the first tweet
        const firstTweetResponse = await client.v2.tweet(tweet1);

        // Post the second tweet as a reply
        await client.v2.tweet({
            text: tweet2,
            reply: {
                in_reply_to_tweet_id: firstTweetResponse.data.id
            }
        });

        // We can construct a fallback URL if getting user info fails, or await it
        let url = `https://twitter.com/user/status/${firstTweetResponse.data.id}`;
        try {
            const me = await client.v2.me();
            url = `https://twitter.com/${me.data.username}/status/${firstTweetResponse.data.id}`;
        } catch (e) {
            console.warn("Could not fetch user ID for URL construction", e.message);
        }

        res.json({ success: true, url: url });
    } catch (error) {
        console.error('Twitter API Publish Error:', error.data || error.message || error);
        res.status(502).json({ error: 'Failed to publish thread to Twitter' });
    }
});

export default router;
