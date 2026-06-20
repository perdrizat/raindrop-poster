# Raindrop Poster — Contributing Guide

## Build & Run

```bash
# Install all workspace dependencies (pnpm workspaces: root, client, server)
pnpm install

# Start client (Vite, port 5173) + server (Express, port 3001) concurrently
pnpm dev
```

Vite proxies `/api` requests to the Express backend automatically.

**Node is pinned via `.node-version` (`24.15.0`) — run `fnm use` after cloning.** This file is the single source of truth: CI reads it (`node-version-file`), so a routine Node bump touches only this file. The lockfile pins packages but not the runtime, so Node must be pinned separately.

This is not cosmetic. **Node 24.16.0 and 24.17.0 have a regression ([nodejs/node#63487](https://github.com/nodejs/node/issues/63487)) where `extract-zip` stalls on large deflated entries**, so puppeteer's Chrome install silently extracts no browser binary — only `chrome-headless-shell`/small files land, the `chrome` executable is missing, and the install "succeeds" (the inflate promise never settles → "unsettled top-level await" → Node exits 0 mid-extract). It bites **only at browser-install/extraction time** (the puppeteer postinstall during `pnpm install`, or `pnpm exec puppeteer browsers install chrome`); a Chrome extracted under a good Node runs fine on any Node afterward. Pin to **≤24.15.0**; **unpin when #63487 is fixed** (no fixed 24.x exists yet — 24.16/24.17 are both affected). Docker is immune (builder is `node:22-slim`; runtime uses the puppeteer image's bundled Chrome).

`engines.node` (`>=22.13.0 <24.16.0`) + `engine-strict=true` (`.npmrc`) is a **warning tripwire, not a hard gate**: pnpm only *warns* (`Unsupported engine: wanted <24.16.0, current 24.17.0`) on the project's own `engines` — it does **not** abort the install (verified on pnpm 11.8). So it flags the buggy 24.16/24.17 visibly, but won't stop anyone. What actually keeps you safe is **Node selection**: `.node-version` (read by fnm and CI's `node-version-file`) plus **`fnm default 24.15.0`** on each devbox, so even non-interactive shells (scripts, `ssh host cmd`, tool shells) land on the good Node. When #63487 is fixed, bump `.node-version` and widen the `engines` upper bound together.

For a **hard, repo-tracked guarantee** (zero per-developer shell setup), add `use-node-version=24.15.0` to `.npmrc`: pnpm then runs every pnpm-invoked Node — the puppeteer postinstall *and* `pnpm exec puppeteer browsers install chrome` — under 24.15.0 regardless of the shell's Node, and it's Docker-safe (`.npmrc` isn't copied into the image). Not enabled here by default; it costs a second copy of the version string.

**Local Chrome (e2e / screenshots only):** the bundled Chrome needs system libraries absent on a bare Linux/WSL box. If you'll run `pnpm test:e2e` or exercise the screenshot feature outside Docker, install them once: `sudo apt-get install -y libnss3 libasound2t64` (on pre-24.04 distros the package is `libasound2` — `libasound2` is a virtual package on 24.04+ and will fail the atomic `apt-get`). Not needed for `pnpm install`, `pnpm dev`, or unit tests; Docker/production already includes them. If launch still fails, the e2e preflight runs `ldd` and names the missing libs; `dpkg -S <lib>` on a working host shows the owning package.

### Package management (pnpm-only)

`pnpm-workspace.yaml` defines the workspace (`client`, `server`) and two supply-chain protections:

- `minimumReleaseAge: 10080` — package versions younger than **7 days** are refused, giving the ecosystem time to catch compromised releases.
- Install scripts are restricted to `esbuild`, `puppeteer`, `sqlite3`; anything else needing a build step must be added to the allowlist deliberately.

Rules: add dependencies with `pnpm -C client add X` / `pnpm -C server add X` (never `npm install`, never `npx` — it bypasses `minimumReleaseAge`). Run tools through package scripts (`pnpm lint`, `pnpm test`), not ad-hoc binaries. Don't reintroduce `package-lock.json`. Update within semver ranges via `pnpm update -r`; major bumps are deliberate, one at a time.

> **TEMPORARY NOTE (added 2026-06-20) — `sqlite3` held at 5.x, do not bump to 6.x. Re-check at the next general dependency upgrade.** sqlite3 6.0.0 modernized its prebuilt-binary toolchain to require **GLIBC_2.38**, newer than the glibc shipped by the Puppeteer base image (`ghcr.io/puppeteer/puppeteer`, Ubuntu-based, glibc ~2.35). A 6.x binary builds and runs fine locally but the container dies at startup with `version 'GLIBC_2.38' not found ... node_sqlite3.node` — and unit tests won't catch it (they load sqlite3 on the dev host, not in the image). The runtime base image is pinned to puppeteer for Chrome compatibility, so we can't raise its glibc independently. **Re-check trigger:** on the next general upgrade, if the puppeteer base image's glibc has reached ≥2.38 (newer Ubuntu base), sqlite3 6.x becomes viable — drop this note then. **Always verify a sqlite3 (or any native-addon) change by loading it inside the built image**, not just on the host: `docker run --rm --entrypoint node -w /app/server raindrop-poster:latest -e "require('sqlite3')"`.

## Test & Quality Infrastructure

One command per layer — **these are the only test mechanisms; extend them rather than creating parallel ones** (we have had two independently-evolving screenshot suites before; merged 2026-06-12):

```bash
pnpm test                                           # All unit tests (client + server)
pnpm lint                                           # ESLint (client + server)
pnpm test:e2e                                       # E2E + visual regression (real Puppeteer/APIs; PNGs → server/scripts/screenshots/)
pnpm -C client test                                 # Client unit tests only (jsdom)
pnpm -C server test                                 # Server unit tests only
pnpm -C client test:coverage                        # Coverage with enforced thresholds (same for -C server)
pnpm audit                                          # Dependency advisories — part of every commit prep
```

**Dependency audit** — run `pnpm audit` before every commit. Fix via `pnpm audit --fix=override` (writes `overrides` + `minimumReleaseAgeExclude` to `pnpm-workspace.yaml` — security patches may bypass the 7-day age gate), then verify: `pnpm install`, `pnpm -C server rebuild sqlite3` (native chain), `pnpm test`, `pnpm -C client build`. Deliberately accepted advisories are documented in a comment in `pnpm-workspace.yaml` with a re-check date.

**Unit tests** — Client: Vitest + @testing-library/react, jsdom, setup in `src/setupTests.js`. Server: Vitest + supertest, config `vitest.config.js`. All external I/O mocked. Red/green TDD: write the failing test first.

**Contract fixtures** (`fixtures/apiContracts.js`) — the drift tripwire between server and client. Server route tests assert their response shapes against these objects; client tests use the same objects as fetch mocks. **When you change an API response shape: update the fixture in the same PR** — the failing tests on both sides are the feature, not an obstacle. Currently fixtured: `/api/system/status`, `/api/venice/generate`, `/api/auth/buffer/test`; add a fixture whenever another endpoint's drift bites.

**Coverage thresholds** — enforced in `client/vite.config.js` and `server/vitest.config.js` (floors ~2-3 points under measured). If a change drops below a floor, add tests; lowering a threshold is a deliberate, justified act, not a fix.

**E2E screenshot suite** (`server/services/screenshot-e2e.test.js`) — the screenshot test: 12 curated problem URLs through the real scrape → capture pipeline, asserting a plausible PNG and saving timestamped images to `server/scripts/screenshots/`. Add a `TEST_CASES` entry for every URL that ever fails in production. Not run in CI (needs network + browsers) — run it locally.

> **A `beforeAll` preflight requires Chrome to actually launch.** If it can't, the suite aborts in ~1s with the exact cause — a missing binary (Node 24.16/24.17 mis-extract, see Build & Run + [#63487](https://github.com/nodejs/node/issues/63487)) or missing system libs (it runs `ldd` and lists them, e.g. `libnss3`/`libasound2t64`) — and prints the fix. The preflight exists because without it a missing/unlaunchable Chrome produces 12 × 30s `ResourceRequest timed out` failures **and a `/tmp` profile storm**: the `min:1` pool (`scraperService.js`) retries `launch()` with no backoff, leaking a `puppeteer_dev_profile-*` dir per attempt until tmpfs runs out of inodes. This is the only place the host Node/libs gaps surface locally — ordinary app use never re-extracts Chrome, and the deployed container bundles both, so neither is affected. Fix per the preflight's message: reinstall Chrome under a pinned Node (`rm -rf ~/.cache/puppeteer && fnm exec --using=24.15.0 pnpm -C server exec puppeteer browsers install chrome`), and/or `apt-get install` the libs it lists.

**CI** (`.github/workflows/ci.yml`) — lint + unit tests + dependency audit on every push/PR. E2E excluded by design.

### Required after screenshot pipeline changes

**Always run `pnpm test:e2e` after editing `server/services/screenshotService.js` (or `highlighter.js`, `scraperService.js`).** Unit tests don't exercise real Puppeteer/network behaviour, so changes to popup dismissal, clip computation, viewport sizing, archive fallbacks, or quote highlighting must be validated against the curated URLs. Assertions only prove a PNG exists — the quality check is **visual**: open each capture (or hand the paths to Claude Code for vision inspection) and confirm the quote is fully highlighted, no overlays bleed through, full page width is visible, and the attribution bar is correct.

**Never delete `server/scripts/screenshots/` or any files inside it.** The user inspects captures manually across runs to compare regressions. Files are timestamped (`YYYYMMDD-HHMM_<name>.png`) so they accumulate without overwriting. The directory is gitignored; let it grow.

## Deploy

```bash
docker compose build && docker compose up -d        # Local: build & run on port 80

pnpm release                                        # Bump version (pnpm version patch)
pnpm build                                          # Build image: raindrop-poster:<version> + :latest
pnpm deploy:remote                                  # Stream both tags to TrueNAS over SSH
# …then restart the app in the TrueNAS UI (TrueNAS recreates the container
# on app restart, so it picks up the new :latest image).
```

**Versioning policy:**
- **At most one version bump per day**, Same-day follow-up fixes ship under the day's existing version: rebuild (`pnpm build`) and redeploy with the **same** tag — skip `pnpm release` - except the user explicitly asks for an additional release. 
- **Only the root `package.json` carries a version.** It feeds the image tag and the UI badge (`VITE_APP_VERSION`, injected at image build time). The `client/` and `server/` manifests are deliberately versionless (`private: true`) — do not re-add `version` fields there; cosmetic numbers drift.
- **Git tag tracks the deployed code:** tag the final commit of a version `v<semver>` and move it on same-day follow-ups (`git tag -f v1.1.0 && git push --force origin v1.1.0`), so the tag always marks the commit the shipped image was built from. Note `pnpm version` only auto-tags on a clean tree — verify with `git tag -l` after a release.
- CHANGELOG headings carry the released version with the date: `## [1.1.0] - 2026-06-12`.

Multi-stage Dockerfile: Stage 1 builds the Vite client, Stage 2 runs Express + Puppeteer on `ghcr.io/puppeteer/puppeteer:25.1.0` — pinned to the project's puppeteer version so the image's bundled Chrome is exactly the build the app launches (avoid `:latest`, which drifts a newer Chrome and breaks the browser resolution). The app uses that bundled browser (`PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer`) rather than re-downloading. Bump this tag together with the `puppeteer` dependency. SQLite data persists in a Docker volume (`raindrop-data` mounted at `/app/data`).

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
