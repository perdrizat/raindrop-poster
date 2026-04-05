# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
