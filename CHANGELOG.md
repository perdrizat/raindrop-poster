# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2026-06-09]

### Fixed
- Dates travel as ISO end-to-end (native `<input type="date">`); fixes "Sep 2026" misparse of day-first locale dates like `9.6.2026`
- Server parses ISO dates as calendar dates (timezone-immune), keeps dotted day-first dates as legacy fallback
- Unparseable dates are skipped in the attribution bar instead of rendering "Invalid Date NaN"

## [2026-05-16]

### Changed
- Migrated Buffer `createPost` `assets` field from the deprecated `{ images: [...] }` object to the new ordered array `[{ image: {...} }]` shape ahead of Buffer's 2026-05-25 cutoff.

## [2026-05-05]

### Fixed
- `dismissPopups` Pass 3 no longer walks every DOM element on the page. The `document.querySelectorAll('*')` + per-element `getComputedStyle()` loop could exceed Puppeteer's 180s `protocolTimeout` on heavy pages, surfacing as `Runtime.callFunctionOn timed out`. Now pre-filters via a targeted selector (inline `position:fixed/sticky`, `header`/`aside`/`dialog`, common banner/modal/popup/overlay class hints) and caps the loop at 800 candidates.
- Publish buttons no longer block on a still-loading screenshot when the user has selected a different image option (Cover / AI / Custom). Previously, a stuck screenshot capture could lock the user out of publishing entirely; now only the image option that's actually being awaited blocks publish.

### Changed
- CONTRIBUTING.md now requires running `./scripts/screenshot-test.sh` after editing `screenshotService.js`, `highlighter.js`, or `scraperService.js`, since unit tests don't exercise real Puppeteer/network behaviour.

## [2026-04-25b]

### Fixed
- SetupPage now auto-migrates legacy Buffer channel entries (bare string IDs or `{id}` objects missing `service`) into enriched `{id, service, name}` shape once Buffer's available channel list is known. Previously these stale entries forced PostPage's char-limit logic to fall back to the strictest known limit (280) instead of using the correct per-platform budget. Stale IDs no longer present in Buffer are also pruned during migration. A toast at the top of the page summarizes what was migrated, and per-channel `[buffer-migrate]` lines are emitted to the console for debugging.
- Strip `source` query parameter from article URLs (e.g. Medium's `?source=rss-...`) alongside the existing `utm_*` and `share_via` cleanup.

## [2026-04-25]

### Fixed
- Twitter character limit restored to 280 (stale temp-debug value of 300 had been left in, causing the warning to fire 20 chars too late)
- The literal string `"null"` from Venice AI (returned when no author is found) no longer appears in the screenshot attribution bar; sanitized in `formatAttribution` and the Venice proposals route

### Changed
- Success toast no longer shows a "Next Post" button; dismissing already re-fetches the queue and advances automatically
- Article URL now shows its character length in parentheses (e.g. `https://example.com/path (45)`) to help gauge the URL budget at a glance

## [2026-04-22]

### Fixed
- Fixed `HighlightedPostEditor` (`contentEditable` div) missing `aria-labelledby` to satisfy accessibility-based test selectors; all 69 tests in `PostPage.test.jsx` now pass
- Character limit logic now produces accurate space budgets by only counting post text and URLs (Attribution and Quotes are no longer appended to the post body, freeing up ~200 chars)
- Bluesky, Twitter/X, and Mastodon character limits now correctly treat URLs at a fixed 23-character cost, matching platform standards
- Character limit budget now accounts for the 2-character separator (`\n\n`) between the post body and the URL

### Changed
- Post editor migrated from `<textarea>` + overlay to a single `contentEditable` `<div>` with inline `<span>` overage highlighting — the red highlight is now part of the text flow, eliminating overlay alignment drift
- Post box now appears above the Quote box in PostPage so it's the primary focus on load
- Post box uses a distinct amber background (`bg-amber-50 / dark:bg-amber-900/20`) to visually differentiate it from the Quote box
- All posts strictly follow the `[Post Text]\n\n[URL]` format; removed "via " and "Says Author" branding from the text body to keep posts clean and concise (branding remains visual-only in screenshots)

## [2026-04-21]

### Added
- Hover any of the 4 image cards (Cover / Screenshot / AI / Custom) to show a fixed-position enlarged preview in the center of the viewport; preview updates as hover moves between cards and is click-through (`pointer-events-none`) so the cursor can still reach the cards underneath
- Auto-regenerate screenshot with author name when Venice AI extraction returns a non-empty author (initial screenshot fires without author since AI runs in parallel; a second capture fires once the name is known)

### Fixed
- Screenshot clip now spans the full 390 px viewport width (x=0, size=viewportWidth) so no text is ever cropped on the right-hand side; vertical padding increased from 15→30 px for more reading space above the quote
- Strip `loading="lazy"` from article images and wait for `networkidle0` before measuring `scrollHeight`; lazy images loading after measurement caused 2000–3500 px layout shifts that misplaced the screenshot clip (Sherlock)
- Set viewport to stable height (post-image-load `scrollHeight`) before running `findQuoteInDOM` so `getClientRects()` returns correct coordinates on pages with remote images

### Changed
- Extracted clip-box calculation into a pure exported `computeClip(foundResult, viewportWidth, pageHeight)` function (replaces the inline `page.evaluate` calculation), making it fully unit-testable
- Extracted `ImageCard` from inside `PostPage` to a module-level component to avoid remounting children on every parent render (previously broke synthetic-event handlers after hover-triggered re-renders)
- `screenshot-test.mjs` output moved from `/tmp/raindrop-screenshots/` to `server/scripts/screenshots/` (gitignored); filenames prefixed with `YYYYMMDD-HHMM_` for easy comparison across runs

## [2026-04-19]

### Added
- Refresh-screenshot button next to Publication field: re-fires `/api/screenshot` with the current (edited) quote, author, date, and domain
- Over-limit highlight: when post text exceeds the strictest channel's limit, the excess characters are highlighted in red via an overlay on the Post textarea
- Queue position is now reflected in the URL hash (`#1` for first, `#3` for third); supports direct linking, browser back/forward, and `hashchange` events

### Changed
- Dismissing a success overlay now re-fetches the articles list so the just-posted bookmark drops out and the queue position advances to the next available article

### Removed
- `raindrop_queue_index` localStorage key (replaced by URL hash)

## [2026-04-17]

### Added
- Stripped marketing tracking parameters (utm, share, etc.) directly from article URLs during fetch to ensure clean URLs across the system
- `spec/unified-post-page-spec.md` — implementation plan for merging Queue and Review screens into a single PostPage
- `observability-raindrop-spec.md` — instrumentation plan for full logging (pino + Loki + MinIO artifacts)
- Unified PostPage: merges Queue (PublishPage) and Review & Publish (ConfirmationPage) into one view. Bookmark navigation (Newer/Older/Regenerate), AI proposals ↔ image options carousel, emoji buttons, publish buttons (Now/Prioritize/Next/Drafts) and top-right PublishOverlay (success/error, partial errors, tag warning, Next Post).
- `BookmarkNav` and `PublishOverlay` reusable components
- AbortController support in `aiService.generateProposals` and `publishService.publishPost` to cancel in-flight requests on bookmark navigation
- UI polish: Save-to-Buffer buttons disabled until Post content is entered; carousel reserves fixed min-height so the page doesn't jump when proposals load or panel switches

### Changed
- Bluesky char check now enforces 277 chars excluding the article URL (instead of 300 including URL). Bluesky's facet system caps every URL at 23 chars regardless of actual length, so 300 − 23 = 277 is the usable text budget. Reverses yesterday's URL-stripping + `linkAttachment` approach; post text now goes to Buffer verbatim for all platforms.

### Removed
- `PublishPage.jsx` and `ConfirmationPage.jsx` (replaced by `PostPage.jsx`)

## [2026-04-16]

### Fixed
- Bluesky posts now strip the article URL from post text and attach it as a `linkAttachment` via Buffer's Bluesky metadata, staying within the 300-char limit
- Partial publish failures (e.g. one channel succeeds, another rejects) now surface in the UI as warnings instead of being silently swallowed

## [2026-04-06]

### Fixed
- Buffer API error messages now forwarded to UI (previously showed generic "threw an exception")
- Character limit check now uses the full post text (including article URL and attribution), not just the editable content
- Fixed missing comma syntax error in screenshot-test.mjs
- Reverted Buffer image `metadata.dimensions` approach (caused 400 errors)

### Added
- Character limit enforcement: publish buttons disabled and amber warning shown when full post text exceeds Bluesky (300) or Mastodon (500) char limits; server-side validation also rejects posts exceeding limits before any channel is posted to
- Buffer channel settings now store service type alongside ID, enabling per-platform validation

## [2026-04-05]

### Changed
- Scraper now extracts structured content (markdown + clean HTML) via Mozilla Readability + Turndown instead of plain text
- Venice AI proposals receive full markdown article text for richer context
- Screenshot pipeline renders pre-scraped article HTML locally via `page.setContent()` when available, eliminating the second page load, popup dismissal, and archive fallback chain; falls back to live URL when quote not found in extracted HTML
- Scrape endpoint returns `{ markdown, html, text }` (backward-compatible)

### Removed
- Outdated spec directory (product_requirements.md, system_architecture.md)
- WIP disclaimer from README

## [2026-04-01]

### Changed
- Venice AI image generation is now on-demand — click the AI card to generate instead of auto-firing on mount (saves API credits)
- Filled in CONTRIBUTING.md (symlinked as CLAUDE.md) with build/test/deploy commands, architecture, patterns, and key files
- Trimmed README.md to user-facing content; developer details moved to CONTRIBUTING.md

## [Previous months (aggregated & summarized)]
