/**
 * Publishes a single post to the selected destination via the backend proxy.
 *
 * @param {string} text The post content text.
 * @param {string} articleUrl The article URL to include.
 * @param {string|null} screenshotUrl The screenshot image URL (for Buffer image attachment).
 * @param {string} destination The target service ('twitter' or 'buffer').
 * @param {string[]} targetChannels Buffer channel IDs.
 * @returns {Promise<Object>} An object containing `{ success: true, url: string }` if successful.
 * @throws {Error} If the API request fails.
 */
export async function publishPost(text, articleUrl, screenshotUrl, destination = 'twitter', targetChannels = [], bufferMode = 'draft') {
    const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, articleUrl, screenshotUrl, destination, targetChannels, bufferMode }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to publish post');
    }

    return data;
}
