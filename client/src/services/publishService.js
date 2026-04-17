/**
 * Publishes a single post to the selected destination via the backend proxy.
 *
 * @param {string} text The post content text.
 * @param {string} articleUrl The article URL to include.
 * @param {Object} imageInfo Image info: { imageData, coverUrl } — at most one should be set.
 * @param {string} destination The target service ('buffer').
 * @param {string[]} targetChannels Buffer channel IDs.
 * @param {string} bufferMode Scheduling mode.
 * @param {AbortSignal} [signal] Optional AbortSignal to cancel the fetch.
 * @returns {Promise<Object>} An object containing `{ success: true, url: string }` if successful.
 * @throws {Error} If the API request fails.
 */
export async function publishPost(text, articleUrl, imageInfo, destination = 'buffer', targetChannels = [], bufferMode = 'draft', signal) {
    const body = { text, articleUrl, destination, targetChannels, bufferMode };
    if (imageInfo?.imageData) body.imageData = imageInfo.imageData;
    if (imageInfo?.coverUrl) body.coverUrl = imageInfo.coverUrl;

    const init = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
    if (signal) init.signal = signal;

    const response = await fetch('/api/publish', init);

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to publish post');
    }

    return data;
}
