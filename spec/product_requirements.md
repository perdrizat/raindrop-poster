# **Product Requirements Document: Raindrop Poster (v1.0)**

Document Version: 1.0  
Date: August 22, 2025

### **1. Introduction / Overview**

Raindrop Poster is a **client-focused web application** designed to streamline the social media workflow for avid content curators. It runs almost entirely in the browser, with a minimal backend component used only to securely communicate with the Twitter/X API. 

It enables users to connect their Raindrop.io account, select bookmarked articles, and use an LLM to automatically generate and publish engaging, multi-part tweet threads to their Twitter/X account. The core focus is on providing a simple, fast, and mobile-friendly experience to help users share content without switching between multiple applications.

### **2. Goals / Objectives**

* **Primary Goal:** To significantly reduce the time and effort required for users to share curated content on Twitter.  
* **Core User Problem:** To solve the "post on the go" challenge by creating a single, consolidated workflow from bookmarking an article in Raindrop.io to publishing a well-formatted thread on Twitter.  
* **Secondary Goal:** To help users overcome writer's block and improve the quality of their social media posts by leveraging an LLM to generate multiple engaging content options.

### **3. Target Audience / User Personas**

The primary target user is a "Content Curator" or "Knowledge Sharer."

* **Description:** They are heavy readers of news, blogs, and research who use Raindrop.io as their central bookmarking and knowledge management tool.  
* **Characteristics:** They are active on Twitter and aim to build a following by sharing valuable insights. They are technically proficient, comfortable with managing API keys, and are looking for tools to automate and optimize their workflow.

### **4. User Stories / Use Cases**

* **Setup:** As a new user, I want to securely connect my Raindrop.io and Twitter accounts and define which tag the app should monitor so I can control my content queue.  
* **Customization:** As an advanced user, I want to provide my own custom LLM prompt to ensure the generated tweets match my personal tone and style.  
* **Generation:** As a user, I want to open the app and immediately see multiple, ready-to-post tweet proposals for the latest article I've tagged, so I can make a quick selection.  
* **Navigation:** As a user with multiple tagged articles, I want to easily navigate between them to decide which one to post next.  
* **Publishing:** As a user, I want to preview the exact content of the full tweet thread before it goes live to avoid any mistakes.  
* **Queue Management:** As a user, I want the app to automatically mark articles as "posted" so they don't appear in my queue again, keeping my workflow organized.

### **5. Functional Requirements**

#### **5.1. Screen 1: Setup**
* The user must authenticate with Raindrop.io and Twitter/X using standard OAuth 2.0 flows ("Log in with..." buttons) initiated by the backend. No manual API keys will be required for user services.
* The Venice.ai LLM service will be configured at the system level via a global backend API key, requiring no user-facing authentication.
* After authenticating with Raindrop.io, the user must specify a single Raindrop.io tag for the application to monitor (e.g., to-tweet).  
* A large text area shall be provided for the LLM system prompt.  
* The prompt field will be pre-filled with a default prompt: "Propose engaging Twitter posts that help me increase my follower count".  
* A "Save" button will persist the tag and prompt settings in the browser's local storage.

#### **5.2. Screen 2: Publish (Proposals View)**
* On load, the app will fetch the 100 most recent items from Raindrop.io that have the monitored tag.  
* The view will default to showing proposals for the single most recent article.  
* The UI will feature "Previous" and "Next" buttons at the top to navigate through the fetched list of articles.  
* A "Retry" button will allow the user to re-run the generation process for the currently viewed article.  
* The app will display three vertically-aligned tweet proposals. Each proposal will be a clickable element.

#### **5.3. Screen 3: Confirmation View**
* This view is shown after a user clicks on a proposal.  
* It will display a preview of the full, two-tweet thread.  
* It must contain a "Back" button to return to the Proposals View.  
* It must contain a "Post to Twitter" button to publish the thread.

#### **5.4. Content Generation & Publishing**
* The app will use the Venice.ai LLM API for text generation.  
* The app will extract the full article text (via a backend proxy scraping endpoint) and combine it with Raindrop.io metadata (title, author, URL, highlights) to construct the prompt.
* The LLM will be prompted to perform the following actions based on the provided text and metadata:  
  1. Generate three distinct proposals for the first tweet.  
  2. If multiple highlights exist in Raindrop, select the most engaging one for the second tweet.  
* **Tweet Thread Structure:**  
  * **Tweet 1:** The user-selected proposal from the LLM.  
  * **Tweet 2 (reply):** Formatted as \[Highlight or Title\] by \[Author\] \[URL\].  
    * If highlights exist, the LLM-selected highlight is used.  
    * If no highlights exist, the raw Raindrop.io title is used.  
* **Post-Publish Actions:**  
  * Upon successful publishing, the app must modify the item in Raindrop.io by removing the monitored tag (e.g., to-tweet) and adding a new tag (e.g., to-tweet\_posted).  
  * A success message, a link to the new tweet, and a "Publish next post" button must be displayed.

#### **5.5. Error Handling**
* In case of an API failure (Raindrop, Twitter, Venice), a technical error message must be displayed to the user.  
* A "Retry" button must be available to attempt the failed action again.

#### **5.6. Backend API**
* The Node.js backend acts as a slim authentication and utility layer. It exposes endpoints to interact with external APIs (via OAuth) and bypass CORS. This includes:  
  * `GET /api/auth/:provider`: Initiates the OAuth flow for the specified provider (`twitter`, `raindropio`).
  * `GET /api/auth/status`: Returns JSON indicating whether the current user's session has active tokens for Twitter and Raindrop.
  * `GET /api/auth/:provider/callback`: Handles the OAuth callback and returns an access token session to the client.
  * `POST /api/publish`: Uses the user's Twitter OAuth session to publish threads.
  * `POST /api/scrape`: Accepts a URL, orchestrates the headless browser execution, and returns the cleaned text.  
  * `POST /api/generate`: Proxies the generation request using the backend's master `VENICE_API_KEY`.
  * `GET/POST /api/raindropio/*`: Proxies Raindrop.io requests using the user's Raindrop OAuth token.

### **6. Non-Functional Requirements**
* **Architecture:** The application uses a **hybrid architecture**, specifically the **Backend for Frontend (BFF)** pattern. The primary application is a **client-side React single-page app (SPA)** built with Vite that handles all business logic and state management. A **Node.js Backend for Frontend (BFF)** is included for managing the OAuth flows for user services (Raindrop, Twitter), securely proxying API requests, making Venice.ai generation requests using a master API key, and scraping article URLs. The backend has minimal business logic and no persistent database.  
* **Technology Stack:** Vite React (Frontend), Node.js / Express (Backend).  
* **Deployment:** The application must be deployable via a Docker container.  
* **Security:** All user-provided settings (tags, prompts) and temporary OAuth access tokens will be stored in the browser's local storage and backend session cookies. The server-side component will securely manage the master OAuth app client IDs and secrets for Raindrop and Twitter, as well as the system-wide API key for Venice, as environment variables.  
* **Performance:** The app should feel responsive, with clear loading indicators during API calls.

### **7. Design Considerations / Mockups**
* The application follows a three-screen flow: Setup \-\> Proposals \-\> Confirmation.  
* The user interface should be minimalist and functional, prioritizing clarity and ease of use, especially on mobile devices.  
* No detailed mockups are required for the MVP.

* **Primary Success Metric:** The total number of tweet threads posted using the application. This metric serves as a direct measure of user adoption and value derived from the tool.
* **Development Methodology:** All feature development and bug fixes must follow a strict **Red/Green Test-Driven Development (TDD)** approach. Developers must first write a failing test, then write the minimum code required to pass the test, and then refactor. Pull requests will not be accepted without complete test coverage verifying the new code.

---

## **Full Project Backlog (Epics 1-6)**

### **Epic 1: User Setup & Configuration**
Here is the updated backlog of user stories for setting up the application, complete with acceptance criteria.

**Story 1: Authenticate Core Services**  
As a Content Curator, I want to authenticate my accounts for Raindrop.io and Twitter/X via OAuth, so that I can be confident the application is correctly connected to all required user services without manually handling API keys. (Venice.ai is managed globally by the system backend).
* **Acceptance Criteria:**  
  * **Scenario 1: Authenticating with Providers**  
    * **Given** I am on the setup screen  
    * **When** I click "Log in with Raindrop.io" or "Log in with X"  
    * **Then** I am securely redirected to the service's OAuth approval screen.  
    * **And** upon approval, I am redirected back to the setup screen.  
    * **And** the UI updates to show the service as "Connected".  
    * **And** if an error occurs during the flow, a toast notification displays a relevant error message (e.g., "Failed to connect to Twitter").
  * **Scenario 2: Failed Connection Test**  
    * **Given** I attempt to log in with a provider  
    * **When** the OAuth flow fails or I deny authorization  
    * **Then** I should see a visual error indicator and a simple error message on the Setup screen. 

**Story 2: Verify API Connections (Smoke Test)**
As a Content Curator, I want to actively test my connections to X, Raindrop, and Venice, so that I can see mathematical proof (like my username or model count) that the APIs are communicating correctly before I start generating content.
* **Acceptance Criteria:**
  * **Scenario 1: Testing a Valid Connection**
    * **Given** I have connected a service via OAuth or have a system API key configured
    * **When** I click the "Test Connection" button next to that service
    * **Then** the UI should display a loading state
    * **And** a pop-up or toast should appear displaying live data fetched from the API (e.g., "Twitter: Logged in as @username").

**Story 3: Define Content Queue**  
As a Content Curator, I want to specify a single Raindrop.io tag for the app to monitor, so that I have full control over which articles appear in my publishing queue.  
* **Acceptance Criteria:**  
  * **Given** I am on the Setup screen and have successfully connected my Raindrop.io API key  
  * **When** I click the dropdown for "Raindrop.io Tag"  
  * **Then** I should be able to pick a single tag name (e.g., `to-tweet`) from the list of all tags currently used in my Raindrop.io.  

**Story 4: Default Content Objectives**  
As a Content Curator, I want to see pre-filled, default posting objectives, so that I can start generating tweets immediately without having to write my own instructions.  
* **Acceptance Criteria:**  
  * **Given** I am visiting the Setup screen for the first time  
  * **When** the page loads  
  * **Then** the "Posting Objectives" text area should be pre-filled with the default text: "Propose engaging Twitter posts that help me increase my follower count".  

**Story 5: Customize AI Tone**  
As a Content Curator, I want to edit and provide my own custom posting objectives, so that I can ensure the generated tweets match my personal tone and style.  
* **Acceptance Criteria:**  
  * **Given** I am on the Setup screen  
  * **When** I click into the "Posting Objectives" text area  
  * **Then** I should be able to delete the existing text and type my own custom objectives.  

**Story 6: Persist Settings**  
As a Content Curator, I want to save all my settings (OAuth tokens, tag, and custom prompt), so that I don't have to re-authenticate every time I open the application.  
* **Acceptance Criteria:**  
  * **Scenario 1: Successful Save**  
    * **Given** I have filled out the required fields and authenticated on the Setup screen  
    * **When** I click the "Save" button  
    * **Then** all the information (including active OAuth session tokens) should be persisted securely in the browser's local storage.  
  * **Scenario 2: Settings are Remembered**  
    * **Given** I have previously saved my settings  
    * **When** I close the browser tab and reopen the application later  
    * **Then** all the fields on the Setup screen should reflect my previously saved information and active connection status.

---

### **Epic 2: Content Ingestion & Curation**
This backlog covers the functionality required to fetch articles from Raindrop.io and allow the user to navigate their content queue.

**Story 1: Fetch Content Queue**
As a Content Curator, I want the app to automatically fetch my most recent tagged articles from Raindrop.io, so that I can see my content queue without manual refreshing.  
* **Acceptance Criteria:**  
  * **Given** I have an active Raindrop.io OAuth session and a monitored tag on the Setup screen  
  * **When** I navigate to the main "Publish" screen  
  * **Then** the application should make an API call to the backend proxy (which forwards to Raindrop.io) to fetch the 100 most recent items that include the monitored tag.

**Story 2: Default to Most Recent**
As a Content Curator, I want to see the content for the most recent article immediately upon loading the main screen, so that I can start my workflow with the newest item first.  
* **Acceptance Criteria:**  
  * **Given** the application has successfully fetched a list of one or more articles  
  * **When** the "Publish" screen finishes loading  
  * **Then** the UI should display the details (e.g., title, highlights) for the single most recent article from that list.  

**Story 3: Navigate Queue**
As a Content Curator, I want to use 'Newer' and 'Older' buttons, so that I can easily navigate through my queue of tagged articles to decide which one to post.  
* **Acceptance Criteria:**  
  * **Scenario 1: Navigation is available**  
    * **Given** the application has fetched more than one article  
    * **When** I am viewing an article on the "Publish" screen  
    * **Then** I should see enabled "Newer" and "Older" buttons.  
  * **Scenario 2: Navigation behavior**  
    * **Given** I am viewing the first (most recent) article  
    * **When** I click the "Older" button  
    * **Then** the UI should update to show the details of the second most recent article.  
  * **Scenario 3: Button states**  
    * **Given** I am viewing the first (most recent) article  
    * **Then** the "Newer" button should be disabled.  
    * **And** **Given** I am viewing the last article in the fetched list  
    * **Then** the "Older" button should be disabled.  

**Story 4: Handle Empty Queue**
As a Content Curator, I want to see a clear message when there are no articles with the monitored tag, so that I know I need to go to Raindrop.io and add content to my queue.  
* **Acceptance Criteria:**  
  * **Given** I have valid settings saved  
  * **When** the application fetches content from Raindrop.io and the API returns an empty list for the monitored tag  
  * **Then** the main view should display a helpful message, such as "No articles found with the 'to-tweet' tag. Add some in Raindrop.io to get started\!".  

**Story 5: Indicate Loading**
As a Content Curator, I want to see a loading indicator while the app is fetching articles, so that I have feedback that the application is working and hasn't frozen.  
* **Acceptance Criteria:**  
  * **Given** I have navigated to the "Publish" screen  
  * **When** the application is actively fetching data from the Raindrop.io API  
  * **Then** a visual loading indicator (e.g., a spinner) should be displayed.  
  * **And** the loading indicator should be removed once the data is successfully loaded or an error is displayed.  

**Story 6: Refresh Content Queue**
As a Content Curator, I want to manually reload my content queue, so that I can see newly tagged articles without having to refresh the entire application.  
* **Acceptance Criteria:**  
  * **Given** I am on the "Publish" screen  
  * **When** I click a "Reload Raindrops" button  
  * **Then** the application should re-trigger the API call to fetch the 100 most recent items with the monitored tag.  
  * **And** the view should update to show the new most recent article if the list has changed.  
  * **And** a loading indicator should be shown during the refetch.

---

### **Epic 3: AI-Powered Content Generation**
This backlog covers the functionality required to use the Venice.ai LLM to generate tweet proposals based on the user's content.

**Story 1: Generate Proposals Automatically**
As a Content Curator, I want tweet proposals to be automatically generated for the article I am currently viewing, so that I can see content options immediately without extra clicks.  
* **Acceptance Criteria:**  
  * **Given** I am on the "Publish" screen and viewing a new article  
  * **When** the article's data (title, URL, highlights) is loaded  
  * **Then** an API call should be automatically triggered to the backend `/api/scrape` endpoint to fetch the full article text.
  * **And** subsequently, an API call should be triggered to the backend `/api/generate` endpoint (which proxies to Venice.ai), including the scraped text and the Raindrop metadata.

**Story 2: Display Tweet Proposals**
As a Content Curator, I want to see three distinct, vertically-aligned proposals for the first tweet, so that I can easily read, compare, and prepare to make a selection.  
* **Acceptance Criteria:**  
  * **Given** the AI generation API call is successful  
  * **When** the application receives the response from Venice.ai  
  * **Then** the UI should display three distinct, vertically-aligned, clickable elements, each containing the text of one tweet proposal.  

**Story 3: Regenerate Proposals on Demand**
As a Content Curator, I want to have a "Retry" button, so that I can get a new set of tweet proposals if I'm not satisfied with the initial suggestions.  
* **Acceptance Criteria:**  
  * **Given** I am viewing a set of tweet proposals for an article  
  * **When** I click the "Retry" button  
  * **Then** a new API call should be made to the Venice.ai service for the same article.  
  * **And** the existing proposals should be replaced by the new set upon a successful response.  

**Story 4: Indicate Generation in Progress**
As a Content Curator, I want to see a loading indicator while proposals are being generated, so that I have clear feedback that the application is working.  
* **Acceptance Criteria:**  
  * **Given** an AI generation process has been triggered  
  * **When** the application is waiting for a response from the Venice.ai API  
  * **Then** a visual loading indicator should be displayed in the proposals area.  
  * **And** this indicator should be removed once the proposals are displayed or an error message appears.  

**Story 5: Handle Generation Errors**
As a Content Curator, I want to see a clear error message if the AI fails to generate proposals, so that I understand there was a problem and can try again.  
* **Acceptance Criteria:**  
  * **Given** an AI generation process has been triggered  
  * **When** the proxy API call to Venice.ai fails for any reason  
  * **Then** a user-friendly error message should be displayed, such as "Could not generate proposals. Please check your connection or try again."  
  * **And** the "Retry" button should remain enabled.

---

### **Epic 4: Publishing Workflow**
This backlog covers the functionality required for a user to select a proposal, preview it, and publish it to Twitter.

**Story 1: Select a Proposal**
As a Content Curator, I want to click on one of the generated proposals, so that I can move forward to the confirmation step.  
* **Acceptance Criteria:**  
  * **Given** I am on the "Publish" screen viewing a list of three tweet proposals  
  * **When** I click on any one of the proposal elements  
  * **Then** the application should navigate me to the "Confirmation View" screen.  

**Story 2: Preview Full Tweet Thread**
As a Content Curator, I want to see a preview of the complete, two-tweet thread exactly as it will appear on Twitter, so that I can confirm everything is correct before publishing.  
* **Acceptance Criteria:**  
  * **Given** I have selected a proposal and am on the "Confirmation View" screen  
  * **When** the screen loads  
  * **Then** I should see a preview of "Tweet 1" containing the exact text of the proposal I selected.  
  * **And** I should see a preview of "Tweet 2" (as a reply) formatted as \[Highlight or Title\] by \[Author\] \[URL\].  

**Story 3: Go Back from Preview**
As a Content Curator, I want a "Back" button on the preview screen, so that I can return to the proposal list if I change my mind.  
* **Acceptance Criteria:**  
  * **Given** I am on the "Confirmation View" screen  
  * **When** I click the "Back" button  
  * **Then** I should be returned to the "Publish" screen, showing the original list of three proposals for the same article.  

**Story 4: Publish to Twitter**
As a Content Curator, I want to click a "Post to Twitter" button, so that the application publishes the prepared thread to my account.  
* **Acceptance Criteria:**  
  * **Given** I am on the "Confirmation View" screen and have reviewed the thread preview  
  * **When** I click the "Post to Twitter" button  
  * **Then** the application should make an API call to our backend's /api/publish endpoint.  
  * **And** the API call payload must contain the content for both Tweet 1 and Tweet 2, utilizing the established Twitter OAuth session for authentication.

**Story 5: View Success Confirmation**
As a Content Curator, I want to see a success message after publishing, including a direct link to the new tweet, so that I have confirmation that it worked and can easily view it.  
* **Acceptance Criteria:**  
  * **Given** the publish API call was successful  
  * **When** the application receives a success response from the backend  
  * **Then** a success message should be displayed.  
  * **And** the message must contain a clickable link to the newly created tweet on Twitter.  

**Story 6: Handle Publishing Errors**
As a Content Curator, I want to see a clear error message if the post fails to publish, so that I know there was a problem and can try again.  
* **Acceptance Criteria:**  
  * **Given** the publish API call has failed  
  * **When** the application receives an error response from the backend  
  * **Then** a technical error message should be displayed, such as "Failed to post to Twitter. API Error: \[error message from backend\]".  
  * **And** I should be able to click "Back" to return to the proposals or "Retry" to attempt publishing again.

---

### **Epic 5: Post-Publish Queue Management**
This backlog covers the functionality required to automatically manage the user's content queue in Raindrop.io after a successful post.

**Story 1: Mark Article as Posted**  
As a Content Curator, I want the app to automatically update the tags on an article in Raindrop.io after I've successfully posted it, so that it is removed from my active queue and I don't post the same content twice.  
* **Acceptance Criteria:**  
  * **Given** a tweet thread has been successfully published to Twitter  
  * **When** the application is processing the successful post  
  * **Then** an API call should be made to the Raindrop.io API to modify the tags of the posted article.  
  * **And** the monitored tag (e.g., `to-tweet`) must be removed from the article.  
  * **And** a new tag (e.g., `to-tweet_posted`) must be added to the article.  

**Story 2: Continue Workflow**  
As a Content Curator, I want a "Publish next post" button on the success screen, so that I can efficiently move to the next item in my queue without extra navigation.  
* **Acceptance Criteria:**  
  * **Given** I am on the success screen after publishing a tweet  
  * **When** I click the "Publish next post" button  
  * **Then** I should be navigated back to the main "Publish" screen.  
  * **And** the article I just posted should be removed from the local list of articles.  
  * **And** the view should now display the next available article in the queue.  

**Story 3: Handle Tagging Errors**  
As a Content Curator, I want to be notified if the app fails to update the tags on Raindrop.io after a successful post, so that I am aware of the issue and can manually clean up my queue later.  
* **Acceptance Criteria:**  
  * **Given** a tweet has been successfully published  
  * **When** the subsequent API call to update the article's tags in Raindrop.io fails  
  * **Then** a non-blocking warning message should be displayed alongside the success message.  
  * **And** the warning message should clearly state the issue (e.g., "Success\! Your tweet is live. Warning: Could not update tags in Raindrop.io.").  

---

### **Epic 6: Core Application & Deployment**
This backlog covers the foundational technical work required to set up the project's architecture and make it deployable.

**Story 1: Initialize Front-End Application**
As a developer, I want a bootstrapped React application with a basic file structure, so that I have a clean foundation to start building UI components.  
* **Acceptance Criteria:**  
  * **Given** I have the project repository cloned  
  * **When** I run the standard command to initialize a new Vite React app (e.g., npm create vite@latest client -- --template react)  
  * **Then** a new React application is created in a client sub-directory with the standard file structure.  
  * **And** running npm run dev from within the client directory successfully launches the React development server.  

**Story 2: Initialize Back-End Server**
As a developer, I want a minimal Node.js server with a basic health-check endpoint, so that I have a running backend to build the Twitter API proxy on.  
* **Acceptance Criteria:**  
  * **Given** I have the project repository cloned  
  * **When** I initialize a new Node.js project in a server sub-directory and install Express  
  * **Then** a server/index.js file is created that starts a basic Express server.  
  * **And** the server must have a GET /api/health endpoint that returns a 200 OK status with a JSON body { "status": "ok" }.  
  * **And** running node server/index.js starts the server without errors.  

**Story 3: Enable Local Development**
As a developer, I want the front-end and back-end to run concurrently and communicate with each other in a local environment, so that I can build and test features that span the full stack.  
* **Acceptance Criteria:**  
  * **Given** the front-end and back-end applications are initialized  
  * **When** I run a single command from the project root (e.g., npm run dev)  
  * **Then** both the React development server and the Node.js server start concurrently.  
  * **And** the React application is configured to proxy API requests to the Node.js server to avoid CORS issues in development.  

**Story 4: Security Audit**
As a developer, I want to ensure my dependencies are free of known vulnerabilities before building for production, so that I don't ship insecure code.
* **Acceptance Criteria:**
  * **Given** the application code is feature complete
  * **When** I run `npm audit` in the `client` and `server` directories
  * **Then** the terminal should report 0 high or critical vulnerabilities for production dependencies.
  * **And** any necessary `npm audit fix` commands must be run and tested before proceeding to the final container build.

**Story 5: Containerize the Application**
As a developer, I want a single Dockerfile that builds and runs both the React front-end and the Node.js back-end, so that the entire application can be deployed as a single, consistent unit.  
* **Acceptance Criteria:**  
  * **Given** a Dockerfile exists in the project root  
  * **When** I run docker build \-t raindrop-poster .  
  * **Then** the Docker image builds successfully without any errors.  
  * **And** the build process must first build the static React assets and then copy them to be served by the Node.js server.  
  * **And** **When** I run the container using docker run \-p 8080:80 raindrop-poster  
  * **Then** the application is accessible and fully functional at http://localhost:8080.