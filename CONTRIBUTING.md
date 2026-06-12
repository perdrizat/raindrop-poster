# Raindrop Poster — Contributing Guide

## Build & Run

```bash
# Install all workspace dependencies (pnpm workspaces: root, client, server)
pnpm install

# Start client (Vite, port 5173) + server (Express, port 3001) concurrently
pnpm dev
```

Vite proxies `/api` requests to the Express backend automatically.

### Package management (pnpm-only)

`pnpm-workspace.yaml` defines the workspace (`client`, `server`) and two supply-chain protections:

- `minimumReleaseAge: 10080` — package versions younger than **7 days** are refused, giving the ecosystem time to catch compromised releases.
- Install scripts are restricted to `esbuild`, `puppeteer`, `sqlite3`; anything else needing a build step must be added to the allowlist deliberately.

Rules: add dependencies with `pnpm -C client add X` / `pnpm -C server add X` (never `npm install`, never `npx` — it bypasses `minimumReleaseAge`). Run tools through package scripts (`pnpm lint`, `pnpm test`), not ad-hoc binaries. Don't reintroduce `package-lock.json`. Update within semver ranges via `pnpm update -r`; major bumps are deliberate, one at a time.

## Test & Quality Infrastructure

One command per layer — **these are the only test mechanisms; extend them rather than creating parallel ones** (we have had two independently-evolving screenshot suites before; merged 2026-06-12):

```bash
pnpm test                                           # All unit tests (client + server)
pnpm lint                                           # ESLint (client + server)
pnpm test:e2e                                       # E2E + visual regression (real Puppeteer/APIs; PNGs → server/scripts/screenshots/)
pnpm -C client test                                 # Client unit tests only (jsdom)
pnpm -C server test                                 # Server unit tests only
pnpm -C client test:coverage                        # Coverage with enforced thresholds (same for -C server)
```

**Unit tests** — Client: Vitest + @testing-library/react, jsdom, setup in `src/setupTests.js`. Server: Vitest + supertest, config `vitest.config.js`. All external I/O mocked. Red/green TDD: write the failing test first.

**Contract fixtures** (`fixtures/apiContracts.js`) — the drift tripwire between server and client. Server route tests assert their response shapes against these objects; client tests use the same objects as fetch mocks. **When you change an API response shape: update the fixture in the same PR** — the failing tests on both sides are the feature, not an obstacle. Currently fixtured: `/api/system/status`, `/api/venice/generate`, `/api/auth/buffer/test`; add a fixture whenever another endpoint's drift bites.

**Coverage thresholds** — enforced in `client/vite.config.js` and `server/vitest.config.js` (floors ~2-3 points under measured). If a change drops below a floor, add tests; lowering a threshold is a deliberate, justified act, not a fix.

**E2E screenshot suite** (`server/services/screenshot-e2e.test.js`) — the *single* screenshot test: 12 curated problem URLs through the real scrape → capture pipeline, asserting a plausible PNG and saving timestamped images to `server/scripts/screenshots/`. Add a `TEST_CASES` entry for every URL that ever fails in production. Not run in CI (needs network + browsers) — run it locally.

**CI** (`.github/workflows/ci.yml`) — lint + unit tests + dependency audit on every push/PR. E2E excluded by design.

### Required after screenshot pipeline changes

**Always run `pnpm test:e2e` after editing `server/services/screenshotService.js` (or `highlighter.js`, `scraperService.js`).** Unit tests don't exercise real Puppeteer/network behaviour, so changes to popup dismissal, clip computation, viewport sizing, archive fallbacks, or quote highlighting must be validated against the curated URLs. Assertions only prove a PNG exists — the quality check is **visual**: open each capture (or hand the paths to Claude Code for vision inspection) and confirm the quote is fully highlighted, no overlays bleed through, full page width is visible, and the attribution bar is correct.

**Never delete `server/scripts/screenshots/` or any files inside it.** The user inspects captures manually across runs to compare regressions. Files are timestamped (`YYYYMMDD-HHMM_<name>.png`) so they accumulate without overwriting. The directory is gitignored; let it grow.

## Deploy

```bash
docker compose build && docker compose up -d        # Build & run on port 80
```

Multi-stage Dockerfile: Stage 1 builds the Vite client, Stage 2 runs Express + Puppeteer on `ghcr.io/puppeteer/puppeteer:latest`. SQLite data persists in a Docker volume (`raindrop-data` mounted at `/app/data`).

**Security model (deliberate decision, 2026-06-12):** the app has no authentication by design — access control is the deployment's responsibility (trusted LAN / VPN / authenticating reverse proxy; see "Security Model" in README.md). Don't add ad-hoc auth to individual routes; if app-level auth is ever needed, it should be one session-gated middleware on `/api/*`.

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
    publish.js                    Buffer GraphQL multi-channel publishing (per-platform char limits)
    cleanup.js                    R2 image cleanup scheduler
    system.js                     System status & BYOK configuration
  middleware/
    rateLimits.js                 Rate limiting for expensive routes (screenshot/venice/scrape)
  services/                     Business logic
    db.js                         SQLite wrapper (settings, post_images) + getConfig (env > setting)
    screenshotService.js          Puppeteer quote screenshots; 120s capture budget
    scraperService.js             Headless browser pool (puppeteer-extra + stealth)
    raindropAuth.js               OAuth token exchange & refresh
    imageHostService.js           Cloudflare R2 upload/delete
    cleanupService.js             Background R2 cleanup timer
    highlighter.js                DOM quote extraction & highlight injection
    urlGuard.js                   SSRF guard: public-http(s)-only URL validation
    shutdown.js                   Graceful SIGTERM/SIGINT shutdown (drains browser pool)
    screenshot-e2e.test.js        THE screenshot E2E suite (curated URLs + visual PNGs)

fixtures/                       Shared API contract fixtures (server tests ↔ client mocks)
.github/workflows/ci.yml        CI: lint + unit tests + dependency audit
pnpm-workspace.yaml             Workspace + supply-chain policy (minimumReleaseAge, build allowlist)
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
| `server/index.js` | Express app entry, middleware, session config, graceful shutdown |
| `server/routes/publish.js` | Buffer GraphQL multi-channel publishing |
| `server/services/screenshotService.js` | Puppeteer screenshot generation with viewport scaling |
| `server/services/db.js` | SQLite settings & image tracking; `getConfig` env-over-setting lookup |
| `server/services/screenshot-e2e.test.js` | The single screenshot E2E suite — add new problem URLs here |
| `fixtures/apiContracts.js` | Shared response-shape fixtures (update when changing an API shape) |
| `pnpm-workspace.yaml` | Workspace + supply-chain policy (7-day minimumReleaseAge, build allowlist) |
| `.github/workflows/ci.yml` | CI gate: lint + unit tests + audit |
| `Dockerfile` | Multi-stage pnpm build (Vite + Puppeteer) |
| `docker-compose.yml` | Single service, volume-mounted SQLite |
