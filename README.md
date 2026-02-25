# Raindrop Poster

Raindrop Poster is a web application designed to streamline the social media workflow for heavy content curators. It provides a simple, consolidated, and mobile-friendly workflow to turn your saved bookmarks in Raindrop.io into engaging, AI-generated Twitter/X threads without the need to switch between multiple applications. 

Built on a hybrid architecture, the project features a snappy React (Vite) frontend for the core user experience, powered by a minimal Node.js (Express) backend that securely handles OAuth flows, fetches article content, and proxies generation requests to Venice.ai.

## Project Structure & Roadmap

Development is organized into six major epics:

* **Epic 1: User Setup & Configuration:** Authenticate with external services (Raindrop.io, Twitter/X) via OAuth and define custom AI posting objectives.
* **Epic 2: Content Ingestion & Curation:** Fetch and navigate a queue of articles directly from Raindrop.io based on a specified tag.
* **Epic 3: AI-Powered Content Generation:** Leverage the Venice.ai LLM to automatically generate multiple tweet proposals based on scraped article content.
* **Epic 4: Publishing Workflow:** Preview the selected AI proposal and publish the thread directly to your Twitter/X timeline.
* **Epic 5: Post-Publish Queue Management:** Automatically update tags in Raindrop.io to mark articles as "posted", keeping your content queue clean.
* **Epic 6: Core Application & Deployment:** Backend/frontend scaffolding, security auditing, and Docker containerization.

For a comprehensive look at the functional requirements, user stories, and technical details, please refer to the project specification documents:
* Detailed [Product Requirements Document](spec/product_requirements.md)
* Technical [System Architecture](spec/system_architecture.md)
