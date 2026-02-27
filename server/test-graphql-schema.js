import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testBufferGraphQL() {
    try {
        const query = `
            query {
                channels {
                    id
                    service
                }
            }
        `;

        const response = await axios.post('https://api.buffer.com/1/graphql', {
            query
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.BUFFER_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log("Success:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("Error Status:", error.response?.status);
        console.error("Error Data:", JSON.stringify(error.response?.data, null, 2));
    }
}
testBufferGraphQL();
