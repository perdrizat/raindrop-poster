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

## Project Roadmap

Development is organized into six epics. We are actively working through them:

* **Epic 1 (Complete): User Setup & Configuration:** Authenticate with external services via OAuth and define custom AI posting objectives.
* **Epic 2 (In Progress): Content Ingestion & Curation:** Fetch and navigate an article queue from Raindrop.io based on tags.
* **Epic 3: AI-Powered Content Generation:** Leverage the Venice LLM to automatically generate tweet proposals.
* **Epic 4: Publishing Workflow:** Preview proposals and publish threads directly to Twitter/X.
* **Epic 5: Post-Publish Queue Management:** Automatically clear processed tags in Raindrop.io.
* **Epic 6: Core Application & Deployment:** Security auditing and Docker containerization.

For comprehensive functional requirements and technical details, see the [Product Requirements](spec/product_requirements.md) and [System Architecture](spec/system_architecture.md).
