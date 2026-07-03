import React, { useState } from 'react'
import SetupPage from './pages/SetupPage'
import PostPage from './pages/PostPage'
import ThemeToggle from './components/ThemeToggle'
import BufferQuotaBanner from './components/BufferQuotaBanner'
import { loadSettings } from './services/settingsService'
import { getSystemStatus } from './services/systemService'

// BUILD_TIME is baked as ISO-8601 UTC at image build; show it in the viewer's
// local timezone. Older images baked a plain local "YYYY-MM-DD HH:MM" string —
// anything unparseable is shown as-is rather than as "Invalid Date".
const formatBuildTime = (raw) => {
  if (!raw) return null;
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}

function App() {
  const settings = loadSettings()
  // True when the initial view was a mere default (no explicit path, no local tag)
  // — the one case the server's selectedTag may upgrade to the Queue below.
  // Captured as lazy state: it must reflect the URL at mount, before the
  // activeView effect rewrites window.location.pathname.
  const [initialViewWasDefault] = useState(() => {
    const path = window.location.pathname;
    return path !== '/setup' && path !== '/queue' && !settings.selectedTag;
  })
  const [activeView, setActiveView] = useState(() => {
    const path = window.location.pathname;
    if (path === '/setup') return 'setup';
    if (path === '/queue') return 'publish';
    return settings.selectedTag ? 'publish' : 'setup';
  })
  const [isSystemConfigured, setIsSystemConfigured] = useState(true); // Assume true initially to prevent flash of setup
  const [isInitializing, setIsInitializing] = useState(true);
  // Workflow settings from the server (SQLite) — the source of truth. localStorage
  // is per-origin, so a reverse-proxy hostname and a direct IP would otherwise
  // drift apart, each origin holding its own selectedTag/postingObjectives.
  const [workflow, setWorkflow] = useState(null);

  React.useEffect(() => {
    const checkSystemStatus = async () => {
      try {
        const status = await getSystemStatus();
        setIsSystemConfigured(status.isConfigured);
        setWorkflow({
          selectedTag: status.selectedTag || '',
          postingObjectives: status.postingObjectives || '',
        });
        if (!status.isConfigured) {
          setActiveView('setup');
        } else if (initialViewWasDefault && status.selectedTag) {
          // Fresh origin (empty localStorage) but the server knows the tag:
          // land on the Queue like any other configured origin.
          setActiveView('publish');
        }
      } catch (error) {
        console.error("Failed to check system status:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    checkSystemStatus();

    // Trigger cleanup check in background (runs only if >6h since last check)
    fetch('/api/cleanup/trigger').catch(() => {});
    // initialViewWasDefault is set-once lazy state — inert in deps, listed for exhaustive-deps
  }, [initialViewWasDefault]);

  React.useEffect(() => {
    if (isSystemConfigured === false) {
      // Enforcement: never allow leaving setup if system is unconfigured
      if (activeView !== 'setup') setActiveView('setup');
    }
    const path = activeView === 'setup' ? '/setup' : '/queue';
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }, [activeView, isSystemConfigured]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
      <BufferQuotaBanner />
      <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <header className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <button onClick={() => setActiveView('publish')} className="text-left focus:outline-none">
            <div className="flex items-center gap-3">
              <img src="/android-chrome-192x192.png" alt="Raindrop Poster" className="w-9 h-9 rounded-lg" />
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Raindrop Poster
              </h1>
            </div>
          </button>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {activeView === 'setup' ? 'Configure your integrations and workflow.' : 'Curate and publish your content.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {(import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_BUILD_TIME) && (
            <span 
              className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 font-mono"
              title={import.meta.env.VITE_BUILD_TIME ? `Built: ${formatBuildTime(import.meta.env.VITE_BUILD_TIME)}` : undefined}
            >
              v{import.meta.env.VITE_APP_VERSION || 'dev'}
            </span>
          )}
          <nav className="flex space-x-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveView('publish')}
              disabled={!isSystemConfigured}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors
                ${activeView === 'publish' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
                ${!isSystemConfigured ? 'opacity-50 cursor-not-allowed hidden sm:block' : ''}`}
            >
              Queue
            </button>
            <button
              onClick={() => setActiveView('setup')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'setup' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Setup
            </button>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="w-full max-w-4xl">
        {activeView === 'setup' && <SetupPage />}

        {activeView === 'publish' && (
          <PostPage
            selectedTag={workflow?.selectedTag || settings.selectedTag}
            postingObjectives={workflow?.postingObjectives || settings.postingObjectives}
          />
        )}
      </main>
      </div>
    </>
  )
}

export default App
