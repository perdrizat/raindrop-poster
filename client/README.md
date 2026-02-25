# Raindrop Poster (Front-End)

This is the React client for the Raindrop Poster application. It provides a streamlined interface for content curators to seamlessly turn Raindrop.io bookmarks into Twitter threads using AI.

## Architecture 

The application uses a hybrid model:
- **Frontend (`client/`):** React SPA (Vite) handling all user interfaces, state management, and workflows.
- **Backend (`server/`):** A lightweight Node.js/Express proxy that handles secure OAuth flows (Twitter, Raindrop), hides the Venice AI API key, and bypasses CORS.

## Development Progress

### ✅ Epic 1: User Setup & Configuration (Complete)
The foundational configuration and authentication layer is fully implemented:
- **OAuth Integration:** Secure "Log in with Raindrop.io" and "Log in with X" buttons.
- **Connection Testing:** Live "Test Connection" buttons that hit real backend endpoints (`/api/auth/twitter/test`, `/api/raindropio/test`, `/api/venice/test`) to verify API access visually.
- **State & Storage:** The UI accurately reflects active connection states by querying the backend session, and local settings (like prompt objectives and tags) are persisted in the browser via `settingsService.js`.
- **API Proxy Clients:** The frontend `authService.js` and `raindropioService.js` are fully wired up to communicate with the local Node.js backend.

### ⏳ Epics 2-6 (Upcoming)
- Content Ingestion & Curation (Raindrop API fetching)
- AI-Powered Content Generation (Venice API integration)
- Publishing Workflow (Twitter API thread posting)
- Post-Publish Queue Management

---

## Getting Started

### Prerequisites
You must have the root-level Node.js backend running concurrently, as the frontend relies on the `/api` proxy for all operations.

```bash
# From the root directory:
npm run dev
```

This will spin up both the Vite dev server (usually `http://localhost:5173`) and the Express backend (`http://localhost:3001`).

### Environment Variables
The frontend relies on the backend to manage all sensitive keys (`.env` in the `server/` directory). No sensitive keys are stored in the frontend client.
