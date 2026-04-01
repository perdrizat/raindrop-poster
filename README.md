# Raindrop Poster

> **Note:** This project is a work in progress (WIP) and is currently being built as an experiment with Antigravity.

Raindrop Poster is a web application designed to streamline the social media workflow for heavy content curators. It provides a simple, consolidated, and mobile-friendly workflow to turn your saved bookmarks in Raindrop.io into engaging, AI-generated social media posts — published directly to your Buffer queue without switching between multiple applications.

## Quick Start

```bash
npm install && (cd client && npm install) && (cd server && npm install)
npm run dev
```

On first launch, a **Setup Wizard** guides you through providing your API keys (Raindrop.io, Venice AI, Buffer, Cloudflare R2). All credentials are stored in a local SQLite database — no `.env` editing required.

For architecture details, testing, and development setup, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Project Features

The application supports the following core workflows:

* **BYOK Setup Wizard:** A first-time configuration wizard where users "Bring Your Own Keys" for Raindrop.io, Venice AI, Buffer, and Cloudflare R2. All keys are persisted to a local SQLite database, surviving container and browser restarts.
* **Content Ingestion:** Automatically fetch and navigate an article queue from Raindrop.io based on tags.
* **AI-Powered Generation:** Leverage the Venice LLM to automatically generate concise (~250 chars) post proposals based on the article's text and highlights.
* **2x2 Image Selection Grid:** Before publishing, choose from four image options displayed in a square grid:
  * **Cover Image** — the bookmark's cover image from Raindrop.io.
  * **Screenshot** — a Puppeteer-generated quote screenshot (see below).
  * **AI Generated** — a Venice.ai image generated from the selected quote.
  * **Custom Upload** — drag-and-drop, paste, or upload your own image (auto-resized to max 1024px).
* **Automated Screenshots:** Generate beautiful, context-aware screenshots of exact text highlights using Puppeteer (`puppeteer-extra` with stealth plugins). Images are kept as local data URLs until publish time, then uploaded to Cloudflare R2 and attached to Buffer posts. A background cleanup process deletes R2 images after posts are sent.
  * **Quote Editing:** Edit the scraped quote on the fly and watch the screenshot seamlessly regenerate.
  * **Intelligent Viewport Scaling:** Screenshots gracefully handle extremely tall DOM content by virtually expanding the viewport up to 8000px to capture quotes anywhere on the page without clipping.
  * **Anti-Bot Evasion:** Robust headless scraping that bypasses strict Cloudflare Turnstile blocks (e.g. on SSRN) using stealth plugins, custom request interception, and automatic fallbacks to Wayback Machine CDNs.
* **Publishing Workflow:** Review AI proposals, verify screenshot attachments, and publish to Buffer with four scheduling modes: **Now** (immediate), **Prioritize** (top of queue), **Next Available** (end of queue), or **Drafts**.
* **X/Twitter Extraction Bypass:** Advanced regex routing transparently swaps restricted `x.com` / `twitter.com` headless payloads with the public `vxtwitter` API to cleanly scrape tweet text without authentication.

### Buffer Multi-Channel Integration

The application publishes exclusively through **Buffer**, supporting **Multi-Channel Selection** — deploy your queue items simultaneously to as many channels as you have configured (e.g. LinkedIn + X/Twitter + Mastodon in a single click).

## Docker Deployment

```bash
docker compose up -d
```

Available at `http://localhost` (port 80). SQLite data persists in a Docker volume across container restarts.

> **Note:** You'll need a Raindrop.io OAuth app with its redirect URI set to `http://yourdomain/api/auth/raindropio/callback`.