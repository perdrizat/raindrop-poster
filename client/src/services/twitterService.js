/**
 * Publishes a two-tweet thread to Twitter via the backend proxy.
 *
 * @param {string} tweet1 The content of the main tweet.
 * @param {string} tweet2 The content of the reply tweet.
 * @returns {Promise<Object>} An object containing `{ success: true, url: string }` if successful.
 * @throws {Error} If the API request fails, throws an error with the response message or a generic one.
 */
export async function publishThread(tweet1, tweet2) {
    const response = await fetch('/api/publish', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tweet1, tweet2 }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to publish thread');
    }

    return data;
}
