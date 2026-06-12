# Code Review — Raindrop Poster

> **Status:** COMPLETED

**Date:** 2026-06-10 · **Reviewer:** Staff-engineer coaching review (first pass)
**Scope:** All production code in `client/src` and `server/` (~5.4k LOC production, ~5.6k LOC tests), test suites, lint setup. High-value findings only; style nitpicks deferred to a later pass.

**Method:** Three parallel deep reads (server, client, test quality), followed by manual verification of every finding reported here. Both test suites and the client linter were executed as part of the audit. Findings that did not survive verification were dropped (one notable example is documented under Strengths).

---

## Health snapshot

| Check | Result |
|---|---|
| Client unit tests (`npx vitest run`) | ✅ 162/162 passed (12 files) |
| Server unit tests (`npm test`) | ✅ 185 passed, 1 skipped (16 files) |
| Client lint (`npm run lint`) | ❌ **fails** — 2 unused-import errors |
| Server lint | ⚠️ no ESLint configured at all |
| Coverage thresholds | ⚠️ none configured in any vitest config |
| File-level test coverage | ~94% — almost every production file has a sibling test file |

The skipped server test is `buffer-integration.test.js` (`describe.skip`, needs live Buffer credentials) — acceptable, but see T3.

---

## What the team does well

Worth saying first, because several of these are above-average for a codebase this size:

1. **Async race handling in `PostPage` is genuinely correct.** The bookmark-switching effect (`PostPage.jsx:417-445`) aborts the prior `AbortController`, threads the signal into every fetch, and re-checks `signal?.aborted` after each `await` before writing state. A reviewer initially flagged this as a race condition; verification showed the guards are complete. This is the pattern to copy elsewhere (see C1).
2. **Domain edge cases are tested at the boundaries on both sides of the stack.** Character-limit logic (23-char URL budget, the `\n\n` separator, per-service limits) is exercised at 277/278, 280/281, 300/301 in both `PostPage.test.jsx` and `publish.test.js`. This is real TDD discipline on the riskiest business rule in the app.
3. **OAuth token refresh is thoroughly tested server-side** (`raindropAuth.test.js`, 230 lines): expiry margin, legacy tokens without expiry, retry-on-401, network failures.
4. **Puppeteer resource management is sophisticated**: `generic-pool` with `testOnBorrow`, idle timeouts, crash recovery; the screenshot pipeline's multi-archive fallback chain degrades gracefully.

---

## High-priority findings

### H1 — SSRF: `/api/scrape` and `/api/screenshot` fetch arbitrary URLs
`server/routes/scrape.js:14-18`, `server/routes/screenshot.js` — the only validation is `new URL(url)` (syntax). Puppeteer will happily navigate to `http://localhost:3001`, RFC-1918 addresses, or cloud metadata endpoints (`169.254.169.254`). Since the app is deployed via Docker on port 80, anyone who can reach the UI can use the server as a proxy into the network it sits on.

**Fix:** shared validator that (a) allows only `http:`/`https:`, (b) resolves and rejects private/loopback/link-local ranges. Cheapest robust option for this app: only accept URLs that came from the user's own Raindrop bookmarks.

### H2 — OAuth tokens and provider payloads leak into logs and HTTP responses
`server/routes/auth.js`:
- **Line 175:** `console.log("RAINDROP RESPONSE", response.data)` — prints the **access token and refresh token** to server logs on every successful OAuth exchange. Debug remnant; in Docker these land in `docker logs` and any log shipper.
- **Lines 178, 184, 189:** failure paths return `JSON.stringify(response.data | rdError.response?.data)` to the **browser**. Provider error payloads can contain client IDs and internals; the browser should get a generic message, the log gets the detail.

**Fix:** delete line 175; replace the three `.send()` bodies with a generic message + server-side `console.error` (which lines 177/183/188 already do).

### H3 — Lint is failing and not enforced anywhere
`npm run lint` currently exits 1 (`within` unused in `PostPage.test.jsx:2`, `beforeEach` unused in `publishService.test.js:1`). Trivial to fix — but the signal is that lint isn't part of anyone's loop. There is no CI config in the repo and the server workspace has no ESLint at all. Related symptom: `handlePaste` (`PostPage.jsx:564-574`) is a `useCallback` with `[]` deps closing over `handleImageUpload` — benign today (it only touches stable setters), but exactly the class of bug `react-hooks/exhaustive-deps` exists to catch, and nothing is gating on it.

**Fix:** fix the 2 errors; add lint+test as a gate (CI, or at minimum the existing `pre_commit_check.sh` habit); add ESLint to `server/`.

---

## Medium-priority findings

### C1 — `SetupPage` initial-status effect lacks the abort pattern `PostPage` already has
`SetupPage.jsx:40-91` runs `Promise.all` of fetches in a mount effect with no `AbortController`/unmount guard — state setters can fire after unmount. The team already wrote the correct pattern in `PostPage`; this is a consistency fix, not new design. Also `SetupPage.jsx:98-99`: `setTags(fetchedTags)` is called twice back-to-back (copy-paste remnant).

### C2 — No graceful shutdown for the browser pool
`scraperService.js` exports `shutdownPool()` but nothing calls it. `server/index.js` has no `SIGTERM`/`SIGINT` handler, so Docker stop/restart leaves Chromium processes to be hard-killed. One-liner handler in `index.js`.

### C3 — Expensive endpoints have no rate limit and no overall deadline
`/api/screenshot` and `/api/venice/*` drive Puppeteer and paid LLM calls with no per-session/IP rate limiting. Inside `screenshotService.js`, each archive fallback gets its own 60s `page.goto` timeout but there is no **total** budget for a capture, so one pathological URL can hold a pool slot for minutes. Add an overall deadline (~120s) and `express-rate-limit` on the expensive routes.

### C4 — Inconsistent error response shapes
Most routes return `{ error: string }` JSON; the OAuth callbacks return plain-text `res.send(...)` (`auth.js:147,151,159,...`). Pick the JSON shape everywhere; clients shouldn't need to sniff content types on failure.

### C5 — LLM output trusted without schema validation
`routes/venice.js` returns `parsed.proposals` to the client assuming it's an array of strings. A malformed-but-parseable LLM response flows straight into the UI. Validate shape (array of strings, author string-or-null) before responding — the route already has a corrective-retry mechanism this could hook into.

### C6 — Repeated config-lookup idiom
`process.env.X || await getSetting('X')` is hand-rolled in `auth.js`, `venice.js`, `raindropAuth.js`, and others. Extract a `getConfig(key)` helper in `db.js` so precedence logic lives in one place.

---

## Test completeness

The suite is in good shape overall; these are the gaps that matter:

### T1 — No coverage thresholds
Neither client nor server vitest config sets coverage minimums. With the current ~94% file coverage you can lock in a high floor cheaply — do it now while it's easy.

### T2 — Untested files with real behavior
`ThemeToggle.jsx` (localStorage + `documentElement.classList` mutation) and `ProviderButton.jsx` have no unit tests; `server/index.js` (session-secret bootstrap from SQLite) is untested. Entry-point glue is forgivable; ThemeToggle's side effects are 30 minutes of tests.

### T3 — Everything client-side is mocked at the fetch layer; contract drift is invisible
`SetupPage.test.jsx` and friends hand-mock every `/api/*` response. If a server route changes its response shape, all client tests stay green. The skipped `buffer-integration.test.js` is the only contract-shaped test and it never runs. Options, cheapest first: share response fixtures between server route tests and client service tests; or extend the existing E2E suite to cover the setup/status contract.

### T4 — Client behavior on auth expiry (401) is untested
`authService.test.js` covers the network-error path but not 401 → re-auth UX. Server-side refresh is well covered; the client half of that story isn't.

---

## Recommended order of attack

| # | Item | Effort |
|---|---|---|
| 1 | H2: delete token log line, genericize OAuth error responses | ~30 min |
| 2 | H3: fix 2 lint errors; wire lint+test into the pre-commit/CI habit | ~1 h |
| 3 | H1: URL allow-listing for scrape/screenshot | ~half day |
| 4 | C2: SIGTERM → `shutdownPool()` | ~15 min |
| 5 | C1: SetupPage abort guard + duplicate `setTags` | ~30 min |
| 6 | T1: coverage thresholds in both vitest configs | ~30 min |
| 7 | C3/C4/C5, T2–T4 | next sprint |

Items 1, 2, 4, 5 together are under half a day and remove the embarrassing-in-production class of issues. H1 is the only one needing a small design decision (allow-list strategy).

---

*Next review can go a level deeper: PostPage decomposition (986 lines — `HighlightedPostEditor`, the image-card carousel, and the publish flow are natural extraction seams), screenshot pipeline structure, and error-shape middleware.*
