# Raindrop Poster — Observability Instrumentation Spec

Instrument raindrop-poster to push full-fidelity logs and image artifacts to the shared observability stack. See `observability-integration-guide.md` for the general integration pattern; this document covers what's specific to this application.

## Prerequisites

- Observability stack running (Loki at `loki:3100`, MinIO at `minio:9000`)
- `observability` Docker network exists
- Read `observability-integration-guide.md` for the general pattern (logger setup, correlation IDs, artifact uploads, frontend log shipping)

## Docker network

Add to `docker-compose.yml`:

```yaml
services:
  raindrop-poster:
    networks:
      - default
      - observability

networks:
  observability:
    external: true
    name: observability
```

## App label

All logs use `{app: "raindrop-poster"}`. MinIO bucket: `raindrop-poster-debug`.

## What to instrument

### Server routes (every `/api/*` endpoint)

Automatic via `pino-http` middleware — logs method, URL, status, response time for every request. Additionally, each route handler should log:

| Route file | What to log |
|------------|-------------|
| `routes/auth.js` | OAuth initiation, callback success/failure, token refresh, provider test results |
| `routes/raindropio.js` | Tag fetch count, article fetch (tag, count, IDs returned) |
| `routes/venice.js` | LLM prompt + response length + model + duration; image prompt + duration + artifact ref |
| `routes/scrape.js` | URL, extraction method (readability vs fallback), markdown length, duration |
| `routes/screenshot.js` | URL, quote text, viewport dimensions, fallback chain (local HTML → live URL → archive), duration, artifact ref |
| `routes/publish.js` | Channel IDs, buffer mode, text length, has image, per-channel success/failure, Buffer API errors |
| `routes/cleanup.js` | R2 keys deleted, count, errors |
| `routes/system.js` | Status check results |

### Server services (business logic)

| Service file | What to log |
|--------------|-------------|
| `services/screenshotService.js` | Browser launch, page navigation, viewport scaling steps, quote found/not-found, screenshot capture, base64 size |
| `services/scraperService.js` | Pool acquire/release, page creation, stealth plugin activation, navigation result, Readability extraction success/failure |
| `services/raindropAuth.js` | Token exchange, token refresh, expiry check |
| `services/imageHostService.js` | R2 upload key, size, duration; R2 delete; connection test |
| `services/cleanupService.js` | Timer start/stop, cleanup cycle start, images found, images deleted |
| `services/highlighter.js` | Quote search (found/not-found), highlight injection |
| `services/db.js` | getSetting/setSetting calls with key names (not values for sensitive keys like API tokens) |

### Image artifacts to capture

Upload to MinIO (`raindrop-poster-debug` bucket) and log the reference:

| Image type | When | Artifact type label |
|------------|------|-------------------|
| Quote screenshot | After `captureQuoteScreenshot` completes | `screenshot` |
| Venice AI image | After `/api/venice/generate-image` returns | `venice-image` |
| Article cover | When cover URL is resolved | `cover` (download and store) |
| Custom upload | When user uploads/pastes an image | `custom-upload` |
| Full-page screenshot | Debug: the raw page before quote highlighting | `page-raw` (optional, behind a flag) |

### Frontend (React SPA)

Ship logs to `POST /api/debug/log` with `{source: "frontend"}` label:

| Page / component | Events to log |
|------------------|---------------|
| `App.jsx` | Page navigation (setup → queue → confirm), settings load |
| `SetupPage.jsx` | Provider test clicks + results, OAuth initiation, save settings |
| `PublishPage.jsx` | Article loaded (ID, title), proposal generation triggered, proposal selected, skip/next |
| `ConfirmationPage.jsx` | Screenshot capture triggered, AI image generation triggered (on-demand click), custom image upload, image option selected, publish button clicked (mode), publish success/failure |

Frontend generates a correlation ID per article flow (when an article is selected in PublishPage) and threads it through all subsequent API calls for that article.

## Sensitive data

**Do not log:**
- API keys or tokens (Venice, Buffer, R2, Raindrop OAuth tokens)
- Session secrets
- Full OAuth callback URLs with auth codes

**OK to log:**
- Which settings keys are being read/written (just the key name)
- Provider names and connection test pass/fail
- Prompt text (it's user content, not a secret)

## Dev vs production

- **Dev** (`npm run dev`): Use `pino-pretty` to stdout. No Loki/MinIO needed. Artifacts skip upload.
- **Production** (Docker): `pino-loki` transport pushes to Loki. Artifacts upload to MinIO. Controlled by `NODE_ENV=production` (already set in Dockerfile).

## Deliverables

1. `server/services/logger.js` — pino logger with Loki transport (production) / pretty-print (dev)
2. `server/services/debugArtifacts.js` — MinIO upload helper for debug images
3. Correlation ID middleware in `server/index.js`
4. `pino-http` middleware in `server/index.js`
5. Instrumentation added to every route and service file listed above
6. `POST /api/debug/log` endpoint for frontend log shipping
7. Frontend logging helper + correlation ID generation in service layer
8. Updated `docker-compose.yml` with observability network
9. Updated `package.json` with new dependencies (`pino`, `pino-loki`, `pino-http`, `pino-pretty`)
