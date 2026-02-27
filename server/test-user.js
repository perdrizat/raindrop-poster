import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testBufferUser() {
    try {
        const response = await axios.get('https://api.bufferapp.com/1/user.json', {
            headers: { Authorization: `Bearer ${process.env.BUFFER_ACCESS_TOKEN}` }
        });
        console.log("Success:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("User API Error Status:", error.response?.status);
    }
}
testBufferUser();
