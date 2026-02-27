# Raindrop Poster

> **Note:** This project is a work in progress (WIP) and is currently being built as an experiment with Antigravity.

Raindrop Poster is a web application designed to streamline the social media workflow for heavy content curators. It provides a simple, consolidated, and mobile-friendly workflow to turn your saved bookmarks in Raindrop.io into engaging, AI-generated Twitter/X threads without the need to switch between multiple applications. 

## Architecture & Setup

The project uses a hybrid architecture:
- **Frontend (`client/`):** React SPA (Vite) handling UI, state, and workflows.
- **Backend (`server/`):** A lightweight Node.js/Express proxy that manages secure OAuth flows (Twitter, Raindrop), hides the Venice AI API key, and bypasses CORS.

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

This spins up the Vite dev server (frontend) and the Express backend on port 3001. All sensitive keys are managed by the backend `.env` file; the frontend requires no secrets.

## Project Features & Roadmap

The application has been successfully built and supports the following core workflows:

* **User Setup & Configuration:** Authenticate with external services via OAuth (Twitter, Raindrop.io) and define custom AI posting objectives.
* **Content Ingestion:** Automatically fetch and navigate an article queue from Raindrop.io based on tags.
* **AI-Powered Generation:** Leverage the Venice LLM to automatically generate concise (~250 chars) tweet proposals based on the article's text and highlights.
* **Publishing Workflow:** Review AI proposals and publish threads directly.

### 🚀 Buffer Multi-Channel Integration (Unplanned Feature)

While the original [Product Requirements](spec/product_requirements.md) only specified direct publishing to X (Twitter), we have successfully integrated **Buffer**! 

You can now toggle your publishing destination in the Settings page to route generated threads directly to your Buffer queue. Furthermore, our Buffer client features **Multi-Channel Selection**, allowing you to deploy your queue items simultaneously to as many channels as you have configured (e.g. LinkedIn + Twitter + Mastodon in a single click) using the latest Buffer GraphQL API. This feature was added organically during development to provide better cross-platform support.

## Documentation

For historical functional requirements and technical details, see the [Product Requirements](spec/product_requirements.md) and [System Architecture](spec/system_architecture.md).
