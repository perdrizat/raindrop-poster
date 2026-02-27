import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testBuffer() {
    try {
        console.log("Token:", process.env.BUFFER_ACCESS_TOKEN ? "Present" : "Missing");
        const response = await axios.get('https://api.bufferapp.com/1/profiles.json', {
            headers: { Authorization: `Bearer ${process.env.BUFFER_ACCESS_TOKEN}` }
        });
        console.log("Success:", response.data);
    } catch (error) {
        console.error("Buffer API Error Status:", error.response?.status);
        console.error("Buffer API Error Data:", JSON.stringify(error.response?.data, null, 2));
        console.error("Buffer API Error Message:", error.message);
    }
}
testBuffer();
