import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function introspectPost() {
    try {
        const query = `
            mutation CreatePost($input: CreatePostInput!) {
                createPost(input: $input) {
                    __typename
                    ... on PostActionSuccess {
                        post {
                            id
                        }
                    }
                    ... on InvalidInputError {
                        message
                    }
                }
            }
        `;

        const variables = {
            input: {
                channelId: process.env.BUFFER_PROFILE_ID,
                text: "Testing createPost at the top of the buffer",
                schedulingType: "automatic",
                mode: "shareNext" // This puts it at the top of the queue
            }
        };

        const response = await axios.post('https://api.buffer.com/1/graphql', {
            query,
            variables
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.errors) {
            console.error("GraphQL Errors:", JSON.stringify(response.data.errors, null, 2));
        } else {
            console.log("Success:", JSON.stringify(response.data.data, null, 2));
        }

    } catch (error) {
        console.error("HTTP Error:", error.response?.status);
        console.error("Error Data:", JSON.stringify(error.response?.data, null, 2));
    }
}
introspectPost();
