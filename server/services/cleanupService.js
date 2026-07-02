import { getSetting, setSetting, getUncleanedImages, removePostImage } from '../services/db.js';
import { deleteImage } from '../services/imageHostService.js';
import { bufferGraphql } from './bufferService.js';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Cleanup used to make one Buffer request per tracked image, which bursts Buffer's
// rate limit. Instead we resolve many posts in a single request via GraphQL field
// aliases (p0, p1, …) and reconcile locally. Batches are capped so a large backlog
// can't produce an over-complex query.
const DEFAULT_BATCH_SIZE = 50;

// Build one aliased GraphQL query that resolves many posts in a single request,
// using the same `post(input: {id})` field the API already supports.
const buildBatchPostQuery = (postIds) => {
    const varDefs = [];
    const fields = [];
    const variables = {};
    postIds.forEach((id, i) => {
        varDefs.push(`$in${i}: PostInput!`);
        fields.push(`p${i}: post(input: $in${i}) { id status sentAt }`);
        variables[`in${i}`] = { id };
    });
    return { query: `query GetPosts(${varDefs.join(', ')}) { ${fields.join(' ')} }`, variables };
};

export const shouldRunCleanup = async () => {
    const last = await getSetting('LAST_CLEANUP');
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > CLEANUP_INTERVAL_MS;
};

export const runCleanup = async (bufferAccessToken, { batchSize = DEFAULT_BATCH_SIZE } = {}) => {
    const images = await getUncleanedImages();
    let cleaned = 0;

    // One batched Buffer request per `batchSize` images (routed through bufferGraphql
    // so each batch also shares the rate-limit backoff).
    for (let i = 0; i < images.length; i += batchSize) {
        const chunk = images.slice(i, i + batchSize);
        try {
            const { query, variables } = buildBatchPostQuery(chunk.map(img => img.post_id));
            const data = await bufferGraphql(bufferAccessToken, query, variables);
            const posts = data?.data || {};

            for (let j = 0; j < chunk.length; j++) {
                const img = chunk[j];
                const post = posts[`p${j}`];
                if (post?.status === 'sent') {
                    console.log(`Cleanup: post ${img.post_id} is sent — deleting R2 image ${img.r2_key}`);
                    await deleteImage(img.r2_key);
                    await removePostImage(img.post_id);
                    cleaned++;
                } else {
                    console.log(`Cleanup: post ${img.post_id} status=${post?.status || 'unknown'} — keeping image`);
                }
            }
        } catch (error) {
            console.error(`Cleanup: error checking ${chunk.length} post(s):`, error.message);
        }
    }

    await setSetting('LAST_CLEANUP', new Date().toISOString());
    return { checked: images.length, cleaned };
};
