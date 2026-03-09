# Raindrop Poster

> **Note:** This project is a work in progress (WIP) and is currently being built as an experiment with Antigravity.

Raindrop Poster is a web application designed to streamline the social media workflow for heavy content curators. It provides a simple, consolidated, and mobile-friendly workflow to turn your saved bookmarks in Raindrop.io into engaging, AI-generated social media posts — published directly to your Buffer queue without switching between multiple applications.

## Architecture & Setup

The project uses a **local-first** architecture with persistent SQLite storage:
- **Frontend (`client/`):** React SPA (Vite) handling UI, state, and workflows.
- **Backend (`server/`):** A Node.js/Express server that manages secure OAuth flows (Raindrop.io), hides API keys, and persists all configuration to a local SQLite database.

### Getting Started

You must run both the backend and frontend concurrently for the system to work:

```bash
# First, install all dependencies across the project
npm install
(cd client && npm install)
(cd server && npm install)

# Then, start both the frontend and backend servers concurrently
npm run dev
```

This spins up the Vite dev server (frontend) and the Express backend on port 3001. On first launch, a **Setup Wizard** will guide you through providing your API keys (Raindrop.io, Venice AI, Buffer, ImgBB). All credentials are stored securely in a local SQLite database — no manual `.env` editing required.

## Project Features

The application supports the following core workflows:

* **BYOK Setup Wizard:** A first-time configuration wizard where users "Bring Your Own Keys" for Raindrop.io, Venice AI, Buffer, and ImgBB. All keys are persisted to a local SQLite database, surviving container and browser restarts.
* **Content Ingestion:** Automatically fetch and navigate an article queue from Raindrop.io based on tags.
* **AI-Powered Generation:** Leverage the Venice LLM to automatically generate concise (~250 chars) post proposals based on the article's text and highlights.
* **Automated Screenshots:** Generate beautiful, context-aware screenshots of exact text highlights using Puppeteer (`puppeteer-extra` with stealth plugins) and upload them via ImgBB to attach to posts.
  * **Quote Editing:** Edit the scraped quote on the fly and watch the screenshot seamlessly regenerate.
  * **Intelligent Viewport Scaling:** Screenshots gracefully handle extremely tall DOM content by virtually expanding the viewport up to 8000px to capture quotes anywhere on the page without clipping.
  * **Anti-Bot Evasion:** Robust headless scraping that bypasses strict Cloudflare Turnstile blocks (e.g. on SSRN) using stealth plugins, custom request interception, and automatic fallbacks to Wayback Machine CDNs.
  * **Custom Image Uploading:** Don't like the generated image? Easily drag-and-drop or paste your own images directly into the Review UI.
* **Publishing Workflow:** Review AI proposals, verify screenshot attachments, and publish directly to Buffer.
* **X/Twitter Extraction Bypass:** Advanced regex routing transparently swaps restricted `x.com` / `twitter.com` headless payloads with the public `vxtwitter` API to cleanly scrape tweet text without authentication.

### 🚀 Buffer Multi-Channel Integration

The application publishes exclusively through **Buffer**, supporting **Multi-Channel Selection** — deploy your queue items simultaneously to as many channels as you have configured (e.g. LinkedIn + X/Twitter + Mastodon in a single click) using the latest Buffer GraphQL API.

> **Developer Note on Buffer API:** The system uses the modern [Buffer GraphQL API Specification](https://developers.buffer.com/reference.html#field-account) for all integrations.

## Documentation

For historical functional requirements and technical details, see the [Product Requirements](spec/product_requirements.md) and [System Architecture](spec/system_architecture.md).
