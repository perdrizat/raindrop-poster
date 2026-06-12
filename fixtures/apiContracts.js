/**
 * Shared API contract fixtures — the drift tripwire between server and client tests.
 *
 * Server route tests assert their responses MATCH THE SHAPE of these objects;
 * client tests use the SAME objects as their fetch mocks. A server-side shape
 * change therefore breaks a server test first, and updating the fixture
 * surfaces every client assumption in the same diff.
 *
 * Scope: only the highest-churn contracts are fixtured (status, venice generate,
 * buffer test). Other endpoints can still drift silently — add a fixture here
 * the next time one bites.
 */

export const systemStatusContract = {
    isConfigured: true,
    hasRaindropConfig: true,
    hasVeniceConfig: true,
    hasBufferConfig: true,
    hasR2Config: true,
    raindropClientId: 'rd-client-id',
    bufferProfileId: 'buffer-profile-id',
    selectedTag: 'important',
    postingObjectives: 'Write factual posts',
    bufferChannels: [{ id: 'bsky-1', service: 'bluesky', name: '@me' }],
};

export const veniceGenerateContract = {
    proposals: ['First proposal text', 'Second proposal text', 'Third proposal text'],
    author: 'Jane Doe',
    imageContext: 'a suburban house resting on a giant golden coin',
};

export const bufferTestContract = {
    success: true,
    channels: [
        { id: '123', service: 'twitter', name: '@mock_x' },
        { id: '456', service: 'linkedin', name: 'Mock LinkedIn' },
    ],
    channelCount: 2,
    services: 'twitter, linkedin',
};

/** Sorted top-level keys — for exact shape assertions in server route tests. */
export const keysOf = (contract) => Object.keys(contract).sort();
