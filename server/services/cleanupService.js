import axios from 'axios';
import { getSetting, setSetting, getUncleanedImages, removePostImage } from '../services/db.js';
import { deleteImage } from '../services/imageHostService.js';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const shouldRunCleanup = async () => {
    const last = await getSetting('LAST_CLEANUP');
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > CLEANUP_INTERVAL_MS;
};

export const runCleanup = async (bufferAccessToken) => {
    const images = await getUncleanedImages();
    let cleaned = 0;

    for (const img of images) {
        try {
            const response = await axios.post('https://api.buffer.com/1/graphql', {
                query: `query GetPost($input: PostInput!) { post(input: $input) { id status sentAt } }`,
                variables: { input: { id: img.post_id } }
            }, {
                headers: {
                    'Authorization': `Bearer ${bufferAccessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const post = response.data?.data?.post;
            if (post?.status === 'sent') {
                console.log(`Cleanup: post ${img.post_id} is sent — deleting R2 image ${img.r2_key}`);
                await deleteImage(img.r2_key);
                await removePostImage(img.post_id);
                cleaned++;
            } else {
                console.log(`Cleanup: post ${img.post_id} status=${post?.status || 'unknown'} — keeping image`);
            }
        } catch (error) {
            console.error(`Cleanup: error checking post ${img.post_id}:`, error.message);
        }
    }

    await setSetting('LAST_CLEANUP', new Date().toISOString());
    return { checked: images.length, cleaned };
};
