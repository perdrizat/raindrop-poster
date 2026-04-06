# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
