import axios from 'axios';
import FormData from 'form-data';

/**
 * Uploads a PNG buffer to ImgBB and returns the public URL.
 * @param {Buffer} pngBuffer - The image data as a Buffer
 * @returns {Promise<{url: string}>} The public URL of the uploaded image
 */
export const uploadImage = async (pngBuffer) => {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) {
        throw new Error('IMGBB_API_KEY is not configured');
    }

    try {
        const base64Image = pngBuffer.toString('base64');

        const form = new FormData();
        form.append('image', base64Image);

        const response = await axios.post(
            `https://api.imgbb.com/1/upload?key=${apiKey}&expiration=86400`,
            form,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        return { url: response.data.data.url };
    } catch (error) {
        console.error('Image upload error:', error.message);
        throw new Error('Failed to upload image');
    }
};
