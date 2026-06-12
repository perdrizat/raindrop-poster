# Raindrop Poster

Raindrop Poster is a web application designed to streamline the social media workflow for heavy content curators. It provides a simple, consolidated, and mobile-friendly workflow to turn your saved bookmarks in Raindrop.io into engaging, AI-generated social media posts — published directly to your Buffer queue without switching between multiple applications.

## Project Features

The application supports the following core workflows:

* **BYOK Setup Wizard:** A first-time configuration wizard where users "Bring Your Own Keys" for Raindrop.io, Venice AI, Buffer, and Cloudflare R2. All keys are persisted to a local SQLite database, surviving container and browser restarts.
* **Unified Composition Workspace:** Queue navigation, AI generation, quote editing, image selection, and multi-channel publishing all happen seamlessly within a single consolidated screen without page loads.
* **AI-Powered Generation:** Leverage the Venice LLM to automatically generate concise (~250 chars) post proposals based on the article's text and highlights.
* **2x2 Image Selection Grid:** Before publishing, choose from four image options displayed in a square grid:
  * **Cover Image** — the bookmark's cover image from Raindrop.io.
  * **Screenshot** — a Puppeteer-generated quote screenshot.
  * **AI Generated** — a Venice.ai image generated from the selected quote.
  * **Custom Upload** — drag-and-drop, paste, or upload your own image (auto-resized to max 1024px).
* **Publishing Workflow:** Review AI proposals, verify screenshot attachments, and publish to Buffer with four scheduling modes: **Now** (immediate), **Prioritize** (top of queue), **Next Available** (end of queue), or **Drafts**.
* **Buffer Multi-Channel Integration:** Deploy your queue items simultaneously to as many channels as you have configured (e.g. LinkedIn + X/Twitter + Mastodon in a single click).

## Security Model — read before deploying

**This app has no authentication.** It is designed as a single-user tool for a trusted private network. Anyone who can reach the web UI can read your Raindrop bookmarks, publish to your social channels, spend your Venice AI credits, and overwrite your stored API keys.

* **Never expose the app directly to the internet** (no port forwarding, no public reverse proxy without auth).
* Run it on a trusted LAN, or access it remotely via a VPN such as [Tailscale](https://tailscale.com/) or WireGuard.
* If you must put it behind a public hostname, front it with an authenticating reverse proxy (e.g. Caddy with `basic_auth`, or an OAuth proxy).
* To restrict access to the Docker host itself, change the port binding in `docker-compose.yml` to `127.0.0.1:80:80`.

## Setup & Deployment

On first launch, a **Setup Wizard** guides you through providing your API keys (Raindrop.io, Venice AI, Buffer, Cloudflare R2). All credentials are stored in a local SQLite database — no `.env` editing required.

> **Note:** You'll need a Raindrop.io OAuth app with its redirect URI set to `http://yourdomain/api/auth/raindropio/callback`.

### Quick Start (Local Development)

```bash
pnpm install        # installs all workspaces (root, client, server)
pnpm dev            # starts Vite client (:5173) + Express server (:3001)
```

> The project uses **pnpm** workspaces. New package versions younger than 7 days are refused (`minimumReleaseAge` in `pnpm-workspace.yaml`) as supply-chain protection, and only `esbuild`, `puppeteer`, and `sqlite3` may run install scripts.

### Docker Deployment (Production)

```bash
docker compose up -d
```
Available at `http://localhost` (port 80). SQLite data persists in a Docker volume across container restarts.

For architecture details, testing, and development setup, see [CONTRIBUTING.md](CONTRIBUTING.md).
