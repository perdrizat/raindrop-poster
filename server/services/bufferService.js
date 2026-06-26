import axios from 'axios';

const BUFFER_GRAPHQL_URL = 'https://api.buffer.com/1/graphql';

/**
 * Buffer's GraphQL query for an organization's connected channels. Requests the
 * superset of fields both callers need (publish.js uses id+service; the buffer
 * smoke test in auth.js also shows name) so one query serves both.
 */
export const CHANNELS_QUERY = `
    query GetChannels($input: ChannelsInput!) {
        channels(input: $input) {
            id
            service
            name
        }
    }
`;

/**
 * Thin transport wrapper around the Buffer GraphQL endpoint — the one place that
 * knows the URL and auth headers. Returns `response.data` verbatim so each caller
 * keeps its own error inspection (`.errors`) and response shaping.
 *
 * @param {string} token Buffer access token
 * @param {string} query GraphQL query/mutation
 * @param {object} variables GraphQL variables
 * @returns {Promise<object>} The raw GraphQL response body
 */
export const bufferGraphql = async (token, query, variables) => {
    const response = await axios.post(BUFFER_GRAPHQL_URL, { query, variables }, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return response.data;
};
