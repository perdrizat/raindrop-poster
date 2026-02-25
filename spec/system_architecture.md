# System Architecture & Technical Task Breakdown

This document outlines the specific technical architecture and implementation tasks required for the Raindrop Poster project.

---

### **Epic 1: User Setup & Configuration (BFF Architecture)**

This outlines the technical tasks for the "User Setup & Configuration" epic, using a Backend for Frontend (BFF) model where the front-end is supplemented by a minimal backend for OAuth flows and API proxies.

#### **Front-End (React)**

1. **Component: Create Setup Page UI**  
   * Build the main React component for the Setup screen.  
   * Create "Log in with Raindrop.io" and "Log in with X" OAuth buttons.  
   * Create secondary "Test Connection" buttons next to each provider (including Venice) that trigger an API smoke test.
   * Implement a dropdown component for the Raindrop.io tag selection, which will be disabled until Raindrop is connected.  
   * Create a multi-line text area for the Posting Objectives.  
   * Add a "Save" button at the bottom of the page.  

2. **State Management: Handle User Inputs & Connections**  
   * Use React's useState hook to manage the selected tag and prompt text.  
   * Implement state to track the OAuth connection status for each provider (e.g., connected, disconnected).  

3. **Browser Storage: Create Settings Service**  
   * Develop a helper module (settingsService.js) to handle all interactions with the browser's localStorage.  
   * Create saveSettings(settings) and loadSettings() functions.  

4. **API Services: Implement Backend Proxy Clients**  
   * **Auth Integration (authService.js):**
     * Create functions `login(provider)` that redirect the user to `/api/auth/${provider}` to initiate the OAuth flow.
     * Create `testConnection(provider)` functions that hit the respective `/api/auth/twitter/test`, `/api/raindropio/test`, and `/api/venice/test` endpoints.
   * **Raindrop.io Client (raindropioService.js):**  
     * Create fetchTags() using the proxy backend GET `/api/raindropio/tags` endpoint.  

5. **Component Logic: Connect UI to Services**  
   * On initial app load, call settingsService.loadSettings() and populate the component's state including active OAuth sessions.  
   * When an OAuth button is clicked, call `authService.login(provider)`.
   * When a "Test Connection" button is clicked, call `authService.testConnection(provider)` and display the JSON result in an alert or toast pop-up.
   * After Raindrop.io is successfully connected, call raindropioService.fetchTags() and populate the tag selection dropdown.  
   * When the "Save" button is clicked, pass the current component state to settingsService.saveSettings().

#### **Back-End (Node.js)**

1. **API Endpoints: OAuth Flows**  
   * Implement `GET /api/auth/:provider` endpoints to initiate OAuth 2.0 flows for Twitter and Raindrop.
   * Implement `GET /api/auth/:provider/callback` endpoints to handle the redirects, securely exchange codes for access tokens, and initiate a session for the client.  

2. **Server Setup: Basic Configuration**  
   * Initialize a basic Node.js server (e.g., using Express).  
   * Configure CORS (Cross-Origin Resource Sharing) to explicitly allow requests from the front-end application's domain.  
   * Set up the server to manage any necessary server-side credentials using environment variables (.env file).

---

### **Epic 2: Content Ingestion & Curation**

This outlines the specific technical tasks required to implement the "Content Ingestion & Curation" epic within the React front-end.

#### **Front-End (React)**

1. **App Structure: Implement Main Navigation & Routing**  
1.  **App Structure: Implement Main Navigation & Routing**
    *   Create a main App.js component to act as the application shell.
    *   Implement a simple navigation bar component with links/buttons for "Publish" and "Setup".
    *   Use React state to manage the currently active view (e.g., const \[activeView, setActiveView\] = useState('publish')).
    *   Conditionally render either the Publish component or the Setup component based on the activeView state. This provides simple client-side routing without needing an external library.

2.  **API Service: Extend Raindrop.io Proxy Client**
    *   In raindropioService.js, create a new function: fetchTaggedItems(tag).
    *   This function will make a GET request to the backend proxy endpoint `/api/raindropio/raindrops/0`.
    *   It must use a search query parameter to filter by the user's monitored tag (e.g., search=\[{"key":"tag","value":"to-tweet"}\]).
    *   The API call should sort the results by creation date to ensure the newest items are first.

3.  **Component: Create Publish Page UI**
    *   Build the main React component for the "Publish" screen.
    *   Add UI elements to display the current article's details (e.g., title, URL, highlights).
    *   Create the "Newer" and "Older" buttons for navigation.
    *   Add a "Reload Raindrops" button.

4.  **State Management: Handle Content Queue**
    *   In the Publish component, use useState to manage the list of fetched articles (e.g., const \[articles, setArticles\] = useState(\[\])).
    *   Use another useState hook to track the index of the currently displayed article (e.g., const \[currentIndex, setCurrentIndex\] = useState(0)).
    *   Implement a loading state (e.g., const \[isLoading, setIsLoading\] = useState(true)).

5.  **Component Logic: Fetching and Displaying Data**
    *   Use a useEffect hook that runs when the component mounts. This hook will call the fetchTaggedItems function from the raindropioService.
    *   On a successful API response, update the articles state with the fetched data and set isLoading to false.
    *   The UI should display the article at articles\[currentIndex\].

6.  **Component Logic: Implement Navigation**
    *   Create onClick handler functions for the "Newer" and "Older" buttons.
    *   The "Older" button's handler should increment currentIndex by 1.
    *   The "Newer" button's handler should decrement currentIndex by 1.
    *   Add logic to disable the "Newer" button if currentIndex is 0, and disable the "Older" button if currentIndex is at the end of the articles array.

7.  **Component Logic: Implement Refresh**
    *   The "Reload Raindrops" button's onClick handler should set isLoading to true, call the fetchTaggedItems function again, and reset currentIndex to 0.

8.  **Component Logic: Handle Edge Cases**
    *   Implement conditional rendering:
        *   If isLoading is true, display a loading spinner component.
        *   If isLoading is false and the articles array is empty, display the "Empty Queue" message component.
        *   Otherwise, display the main article view.

---

### **Epic 3: AI-Powered Content Generation**

This outlines the specific technical tasks required to implement the "AI-Powered Content Generation" epic within the React front-end.

#### **Front-End (React)**

1.  **API Service: Implement Venice Generation & Scraping**
    *   In veniceService.js, create a new function: generateProposals(systemPrompt, article).
    *   First, call the backend `/api/scrape` proxy, passing the `article.link` to get the full article text.
    *   Then, make a POST request to the backend `/api/generate` endpoint, which proxies to Venice.ai.
    *   It must construct a payload that includes the user's custom systemPrompt, the scraped article text, and article metadata.
    *   The function should return the raw text content from the successful API response.

2.  **Utility: Create Proposal Parser**
    *   Create a new helper function, parseProposals(responseText).
    *   This function will take the single raw string returned by the Venice.ai API as input.
    *   It will parse the string using JSON.parse(responseText).
    *   It will then return the proposals array from the resulting object (e.g., return JSON.parse(responseText).proposals).
    *   The function should be wrapped in a try...catch block to handle potential JSON parsing errors gracefully.

3.  **State Management: Handle Proposals**
    *   In the Publish component, add new useState hooks to manage the AI generation lifecycle:
        *   const \[proposals, setProposals\] = useState(\[\]) to store the array of generated tweet strings.
        *   const \[isGenerating, setIsGenerating\] = useState(false) to track the loading state for the AI call.
        *   const \[generationError, setGenerationError\] = useState(null) to store any error messages.

4.  **Component: Update Publish Page UI**
    *   Create a container element to display the generated proposals.
    *   Inside the container, map over the proposals state array to render three distinct, clickable proposal components.
    *   Add a "Retry" button to the UI.

5.  **Component Logic: Automatic Generation Trigger**
    *   Create a useEffect hook that has the currentArticle (or currentIndex) as a dependency.
    *   When the currentArticle changes, this hook will:
        1.  Clear out old proposals and errors (setProposals(\[\]), setGenerationError(null)).
        2.  Set isGenerating to true.
        3.  Call the generateProposals function from the veniceService.
        4.  On success, pass the raw response text to the parseProposals utility function.
        5.  Update the proposals state with the resulting array of strings.
        6.  On failure, update the generationError state.
        7.  Finally, set isGenerating to false.

6.  **Component Logic: Implement "Retry"**
    *   Create an onClick handler for the "Retry" button.
    *   This handler will execute the same logic as the useEffect hook (steps 5.2 - 5.7) to re-fetch proposals for the current article.

7.  **Component Logic: Conditional Rendering**
    *   Update the proposals container to render different content based on the state:
        *   If isGenerating is true, display a loading spinner component.
        *   If generationError is not null, display the error message component.
        *   If proposals has data, display the list of proposals.

8.  **Prompt Engineering: Construct the User Message**
    *   Inside the generateProposals service function, create the logic to format the article data and scraped content into a clear and concise prompt for the LLM.
    *   **Example format:**
        Here is an article I want to share.
        Title: \[Article Title\]
        URL: \[Article URL\]
        My Highlights: \[Concatenated string of highlights, or "None"\]
        Article Text: \[Scraped Text\]

        Based on the article and my system prompt, generate three distinct post proposals, each with a different angle:
        1.  A Question: A post that poses a question to the audience.
        2.  A Surprising Fact: A post that highlights a surprising statistic or fact.
        3.  A Contrarian Take: A post that presents a thought-provoking or alternative perspective.

        Return your response as a single, minified JSON object. The object should have one key named "proposals", which is an array containing the three proposal strings.

---

### **Epic 4: Publishing Workflow**

This outlines the specific technical tasks required to implement the "Publishing Workflow" epic.

#### **Front-End (React)**

1.  **App Structure: Add Confirmation View**
    *   In the main App.js component, add a new view state for the "Confirmation" screen.
    *   When a user clicks a proposal on the Publish screen, the app state should change to render the Confirmation component and pass the selected proposal and article data as props.

2.  **Component: Create Confirmation Page UI**
    *   Build the Confirmation component.
    *   It should display two distinct sections, one for "Tweet 1" (the selected proposal) and one for "Tweet 2".
    *   Add a "Back" button and a "Post to Twitter" button.

3.  **API Service: Implement Venice Highlight Selection via Proxy**
    *   In veniceService.js, create a new async function: selectEngagingHighlight(postingObjectives, article, highlights).
    *   This function will make a POST request to the backend proxy `/api/generate` endpoint.
    *   It will construct a prompt that provides the article context, the user's objectives, and the list of highlights, asking the LLM to choose the best one.
    *   **Prompt Example:** "Given the article at \[URL\] and my objective to '\[postingObjectives\]', which of the following highlights is the most engaging for a tweet? Return only the text of the single best highlight. Highlights: \[JSON.stringify(highlights)\]"
    *   The function will return the single highlight string chosen by the LLM.

4.  **Component Logic: Construct Second Tweet**
    *   Inside the Confirmation component, use a useEffect hook to determine the content for the second tweet when the component loads.
    *   If the article has multiple highlights, set a loading state and call the selectEngagingHighlight service function.
    *   If the article has one or zero highlights, use the single highlight or the article's title, respectively.
    *   Once the content is determined, store it in state and format the final string as \[Highlight or Title\] by \[Author\] \[URL\].

5.  **API Service: Extend Twitter Client**
    *   In twitterService.js, create a new function: publishThread(tweet1, tweet2).
    *   This function will make a POST request to our backend's /api/publish endpoint, sending the content for both tweets. Authentication is handled implicitly by the user's backend OAuth session cookie/token.

6.  **State Management: Handle Publishing Flow**
    *   In the Confirmation component, add useState hooks to manage the publishing process:
        *   const \[isSelectingHighlight, setIsSelectingHighlight\] = useState(false)
        *   const \[isPublishing, setIsPublishing\] = useState(false)
        *   const \[publishError, setPublishError\] = useState(null)
        *   const \[publishSuccess, setPublishSuccess\] = useState(null) (to store the success message and tweet link).

7.  **Component Logic: Implement Publishing**
    *   Create an onClick handler for the "Post to Twitter" button.
    *   This handler will set isPublishing to true, call the publishThread function, and handle the success or error response by updating the appropriate state.

8.  **Component Logic: Conditional Rendering**
    *   Update the Confirmation component to display different UI based on the state:
        *   If isSelectingHighlight, show a loading indicator in the "Tweet 2" area.
        *   If isPublishing, show a loading indicator over the whole component and disable the buttons.
        *   If publishError exists, show the technical error message.
        *   If publishSuccess exists, show the success message with the link to the tweet.
        *   Otherwise, show the default preview.

#### **Back-End (Node.js)**

1.  **API Endpoint: Create /api/publish**
    *   Create a new POST endpoint at /api/publish.
    *   It should expect a JSON body containing tweet1 and tweet2.
    *   It must access the user's Twitter OAuth access token from their session.

2.  **Twitter Integration: Implement Thread Publishing**
    *   **Docs:** [https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets](https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets)
    *   Use a reliable Twitter API client library (e.g., twitter-api-v2) to handle the API calls utilizing the user's OAuth tokens.
    *   First, post tweet1.
    *   On success, get the id of the newly created tweet.
    *   Then, post tweet2, making sure to include the in\_reply\_to\_tweet\_id field in the payload to create the thread.

3.  **Response Handling: Return Success or Failure**
    *   If the thread is posted successfully, respond to the front-end with a success message and the URL of the first tweet.
    *   If any of the Twitter API calls fail, catch the error, extract the error message from the Twitter API's response, and send it back to the front-end in a structured error response (e.g., { "success": false, "error": "Twitter API Error: \[message\]" }).

---

### **Epic 5: Post-Publish Queue Management**

This outlines the specific technical tasks required to implement the "Post-Publish Queue Management" epic. All work will be done in the React front-end.

#### **Front-End (React)**

5. **Component Logic (Confirmation View): Handle "Continue" Workflow**  
   * Create an onClick handler for the "Publish next post" button.  
   * This handler will call a function (passed down from App.js) to remove the just-posted article from the main articles state array.  
   * It will then call another function to switch the main application view back to the "Publish" screen. The currentIndex should be reset or adjusted to ensure it's valid for the new, shorter list.

---

### **Epic 6: Core Application & Deployment**

This outlines the foundational technical work required to set up the project's architecture and make it deployable. You will need Node.js, Docker and Git installed to work on this.

**Story 1: Initialize Front-End Application**

1. **Task: Create Project Structure**  
   * Create a root directory for the project.  
2. **Task: Bootstrap React App**  
   * Run `npm create vite@latest client -- --template react` in the root directory to initialize the application in a `client` folder.

**Story 2: Initialize Back-End Server**

1. **Task: Create Project Structure**  
   * Inside the root directory, create a server directory.  
2. **Task: Initialize Node.js Project**  
   * Navigate into the server directory.  
   * Run npm init \-y to create a package.json file.  
   * Run npm install express to add the Express framework.  
3. **Task: Create Basic Server**  
   * Create a file server/index.js.  
   * Write the necessary Express code to start a server listening on a port (e.g., 3001).  
   * Implement a GET /api/health endpoint that responds with res.json({ status: "ok" }).

**Story 3: Enable Local Development**

1. **Task: Install Concurrently**  
   * In the **root** project directory, run npm init \-y.  
   * Run npm install concurrently to add the tool for running multiple scripts at once.  
2. **Task: Configure Root package.json**  
   * Add a dev script to the root package.json that uses concurrently to run both the front-end and back-end start scripts (e.g., `"dev": "concurrently \"npm run dev --prefix client\" \"node server/index.js\""`).  
3. **Task: Configure Vite Proxy**  
   * In the `client/vite.config.js` file, add a backend proxy setup for the `/api` route pointing to `http://localhost:3001` to bypass CORS in development.

**Story 4: Security Audit**

1. **Task: Run NPM Audit**
   * Before pushing the final code, navigate to the `client` directory and run `npm audit`.
   * Navigate to the `server` directory and run `npm audit`.
2. **Task: Resolve Vulnerabilities**
   * Review any flagged items.
   * Run `npm audit fix` where safe. 
   * Ignore or specifically target devDependency warnings in the `client` (e.g. `eslint` or `minimatch`) that don't affect the production build, ensuring no `--force` flags break the local dev pipeline unless strictly necessary.

**Story 5: Containerize the Application**

1. **Task: Create Dockerfile**  
   * In the project root, create a file named Dockerfile.  
2. **Task: Implement Multi-Stage Build**  
   * **Stage 1 (Build Stage):**  
     * Use a node base image.  
     * Copy the client directory's package.json and run npm install.  
     * Copy the rest of the client source code.  
     * Run npm run build to generate the static React assets.  
   * **Stage 2 (Production Stage):**  
     * Use a lean node base image (e.g., node:alpine).  
     * Copy the server directory's package.json and run npm install \--production.  
     * Copy the server source code.  
     * Copy the built React assets from the build stage (--from=build /app/client/build) into a public folder in the server.  
     * Configure the Express server in server/index.js to serve the static files from this public folder.  
3. **Task: Define Final Docker Command**  
   * Expose the application port (e.g., EXPOSE 80).  
   * Set the CMD to start the Node.js server (e.g., CMD \["node", "index.js"\]).