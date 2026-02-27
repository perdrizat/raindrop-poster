import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function introspectPost() {
    try {
        const queryChannels = `
            query GetChannels($input: ChannelsInput!) {
                channels(input: $input) { id service }
            }
        `;
        const resChannels = await axios.post('https://api.buffer.com/1/graphql', {
            query: queryChannels, variables: { input: { organizationId: process.env.BUFFER_PROFILE_ID } }
        }, { headers: { 'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });
        
        const channels = resChannels.data.data.channels;
        console.log("Channels:", channels);
        
        if (channels.length === 0) return console.log("No channels found");
        const channelId = channels[0].id;

        const query = `
            mutation CreatePost($input: CreatePostInput!) {
                createPost(input: $input) {
                    __typename
                    ... on PostActionSuccess { post { id } }
                    ... on InvalidInputError { message }
                }
            }
        `;

        const variables = {
            input: {
                channelId: channelId,
                text: "Testing createPost at the top of the buffer on channel " + channels[0].service,
                schedulingType: "automatic",
                mode: "shareNext" 
            }
        };

        const response = await axios.post('https://api.buffer.com/1/graphql', {
            query, variables
        }, { headers: { 'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });
        
        console.log("Create Post Response:", JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error("HTTP Error:", error.response?.status);
    }
}
introspectPost();
