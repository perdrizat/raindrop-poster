import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testBufferGraphQL() {
    try {
        console.log("Testing Channels Query...");
        const queryChannels = `
            query GetChannels($input: ChannelsInput!) {
                channels(input: $input) {
                    id
                    service
                }
            }
        `;
        const resChannels = await axios.post('https://api.buffer.com/1/graphql', {
            query: queryChannels,
            variables: {
                input: {
                    organizationId: process.env.BUFFER_PROFILE_ID
                }
            }
        }, { headers: { 'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });
        
        if (resChannels.data.errors) {
            console.error("Channels Error:", JSON.stringify(resChannels.data.errors, null, 2));
        } else {
            console.log("Channels Success:", JSON.stringify(resChannels.data.data, null, 2));
        }

        console.log("\nTesting CreateIdea Mutation...");
        const queryIdea = `
            mutation CreateIdea($input: CreateIdeaInput!) {
                createIdea(input: $input) {
                    ... on Idea {
                        id
                        content {
                            title
                            text
                        }
                    }
                }
            }
        `;
        const resIdea = await axios.post('https://api.buffer.com/1/graphql', {
            query: queryIdea,
            variables: {
                input: {
                    organizationId: process.env.BUFFER_PROFILE_ID,
                    content: {
                        title: "Raindrop Poster Test",
                        text: "This is an automated test from Raindrop Poster."
                    }
                }
            }
        }, { headers: { 'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });

        if (resIdea.data.errors) {
            console.error("CreateIdea Error:", JSON.stringify(resIdea.data.errors, null, 2));
        } else {
            console.log("CreateIdea Success:", JSON.stringify(resIdea.data.data, null, 2));
        }

    } catch (error) {
        console.error("HTTP Error:", error.response?.status, error.response?.data);
    }
}
testBufferGraphQL();
