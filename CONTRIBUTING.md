# Raindrop Poster — Contributing Guide

## Build & Run

```bash
# Install all dependencies
npm install && (cd client && npm install) && (cd server && npm install)

# Start client (Vite, port 5173) + server (Express, port 3001) concurrently
npm run dev
```

Vite proxies `/api` requests to the Express backend automatically.

## Test

```bash
cd client && npx vitest run                        # Client unit tests (jsdom)
cd server && npm test                               # Server unit tests
cd server && npm run test:e2e                       # E2E tests (Puppeteer + real APIs)
./scripts/screenshot-test.sh                        # Visual regression (saves to server/scripts/screenshots/)
```

- Client: Vitest + @testing-library/react, globals enabled, jsdom environment, setup in `src/setupTests.js`
- Server: Vitest + supertest, separate configs for unit (`vitest.config.js`) and E2E (`vitest.e2e.config.js`)

### Required after screenshot pipeline changes

**Always run `./scripts/screenshot-test.sh` after editing `server/services/screenshotService.js` (or `highlighter.js`, `scraperService.js`).** Unit tests don't exercise real Puppeteer/network behaviour, so changes to popup dismissal, clip computation, viewport sizing, archive fallbacks, or quote highlighting must be validated against the curated set of problem URLs in `server/scripts/screenshot-test.mjs`. The 7 captures (~3 minutes) confirm: quote correctly highlighted, no overlays bleeding through, full page width visible, no truncation. Open each PNG and verify, or hand the file paths to Claude Code for vision-based inspection.

## Deploy

```bash
docker compose build && docker compose up -d        # Build & run on port 80
```

Multi-stage Dockerfile: Stage 1 builds the Vite client, Stage 2 runs Express + Puppeteer on `ghcr.io/puppeteer/puppeteer:latest`. SQLite data persists in a Docker volume (`raindrop-data` mounted at `/app/data`).

## Architecture

```
client/                         React SPA (Vite + Tailwind)
  src/pages/                    SetupPage, PostPage (unified queue + compose + publish)
  src/components/               BookmarkNav, PublishOverlay, ThemeToggle, etc.
  src/services/                 Thin fetch wrappers for /api/* endpoints
  src/utils/                    Helpers (imageUtils)

server/                         Node.js/Express backend
  index.js                      App entry: middleware, sessions, static serving
  routes/                       API endpoints by domain
    auth.js                       OAuth flows (Raindrop.io), provider connection tests
    raindropio.js                 Proxy to Raindrop.io API (tags, bookmarks)
    venice.js                     Venice AI: LLM proposals + image generation
    scrape.js                     Article text extraction
    screenshot.js                 Puppeteer screenshot capture
    publish.js                    Buffer GraphQL API publishing
    cleanup.js                    R2 image cleanup scheduler
    system.js                     System status
  services/                     Business logic
    db.js                         SQLite wrapper (settings key-value, post_images tracking)
    screenshotService.js          Puppeteer quote screenshots with viewport scaling
    scraperService.js             Headless browser pool (puppeteer-extra + stealth)
    raindropAuth.js               OAuth token exchange & refresh
    imageHostService.js           Cloudflare R2 upload/delete
    cleanupService.js             Background R2 cleanup timer
    highlighter.js                DOM quote extraction & highlight injection
```

**Data flow:** React SPA calls `/api/*` -> Express route -> service layer (external APIs, Puppeteer, SQLite) -> JSON response.

**No `.env` file needed.** All API keys and tokens are configured through the Setup Wizard and persisted in SQLite. In dev, Vite runs on :5173 with a proxy; in production, Express serves the built client and runs on port 80.

**Key integrations:**
- **Raindrop.io** — OAuth 2.0 for bookmark access. Redirect URI: `http://yourdomain/api/auth/raindropio/callback`
- **Venice AI** — LLM text proposals + image generation (model: `gpt-image-1-5`)
- **Buffer** — Multi-channel publishing via [GraphQL API](https://developers.buffer.com/reference.html#field-account). Supports simultaneous publishing to LinkedIn, X/Twitter, Mastodon, etc. **Bluesky note:** Bluesky counts all text including URLs against its 300-char limit. The Bluesky app silently truncates URLs via the [facets system](https://github.com/bluesky-social/atproto/discussions/3517), but the API does not. We strip the article URL from the post text and attach it via `metadata.bluesky.linkAttachment` so it appears as a link card without eating into the character budget.
- **Cloudflare R2** — S3-compatible image hosting for screenshots; background cleanup after publish

## Patterns & Conventions

- **React:** Functional components + hooks only. Props drilling (no Redux/Context). localStorage for persistent UI state.
- **Server:** ES modules, async/await, Express routing. SQLite via promise-wrapped `sqlite3`.
- **Styling:** Tailwind CSS with dark mode support.
- **Error handling:** Try/catch in async functions, user-facing error state in React, JSON error responses from API.
- **Image pipeline:** Images stay as local base64 data URLs until publish time, then upload to R2 and attach to Buffer.
- **Venice AI images:** Generated on-demand (user clicks the AI card) to conserve API credits.

## Character Limit Rules

- **Total Budget:** Based on platform limits (e.g., 300 for Bluesky, 280 for Twitter/X, 500 for Mastodon/Threads).
- **Usage:** Only the post body text and the article URL are counted against the limit. Note that a **2-character separator** (`\n\n`) is automatically added between your text and the URL, which is also included in the total count.
- **URL Budget:** Article URLs are treated as exactly **23 characters** for major services (Bluesky, Twitter/X, Mastodon), regardless of their actual length. This applies both when the service is known and in the app's internal "safe" fallback logic.
- **No Attribution Text:** Quotes, author names, and "via" branding are **not** appended to the post text and are **not** counted in the limit check. They are strictly visual elements within the generated screenshot image.

## Key Files

| File | Role |
|------|------|
| `client/src/App.jsx` | Main shell, navigation, view routing |
| `client/src/pages/PostPage.jsx` | Unified queue + compose + publish (bookmark nav, AI proposals ↔ image options carousel, publish buttons, overlay) |
| `client/src/pages/SetupPage.jsx` | BYOK wizard, OAuth, provider tests |
| `server/index.js` | Express app entry, middleware, session config |
| `server/routes/publish.js` | Buffer GraphQL multi-channel publishing |
| `server/services/screenshotService.js` | Puppeteer screenshot generation with viewport scaling |
| `server/services/db.js` | SQLite settings & image tracking |
| `Dockerfile` | Multi-stage build (Vite + Puppeteer) |
| `docker-compose.yml` | Single service, volume-mounted SQLite |
