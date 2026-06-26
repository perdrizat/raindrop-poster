/**
 * Per-platform Buffer publishing limits — the single source of truth shared by the
 * client (pre-flight validation in PostPage) and the server (authoritative validation
 * in routes/publish.js), so the two can never silently disagree on a limit.
 *
 * URLs cost a fixed 23 chars on services that shorten them (Bluesky facets,
 * Twitter t.co, Mastodon API). Threads counts the full text, so it is absent from
 * URL_SHORTENED_SERVICES. A "\n\n" separator (2 chars) sits between body and URL.
 *
 * Imported across the pnpm workspace boundary by relative path; the Dockerfile
 * copies this dir into both build stages so client `vite build` and the server
 * runtime can resolve it.
 */
export const CHAR_LIMITS = { bluesky: 300, twitter: 280, mastodon: 500, threads: 500 };

export const SHORTENED_URL_LEN = 23;

export const URL_SHORTENED_SERVICES = ['bluesky', 'twitter', 'mastodon'];
