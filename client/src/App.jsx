import React, { useState } from 'react'
import SetupPage from './pages/SetupPage'
import PublishPage from './pages/PublishPage'
import ThemeToggle from './components/ThemeToggle'
import { loadSettings } from './services/settingsService'

function App() {
  const [activeView, setActiveView] = useState('setup')
  const settings = loadSettings()

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <header className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Raindrop Poster
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {activeView === 'setup' ? 'Configure your integrations and workflow.' : 'Curate and publish your content.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex space-x-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveView('setup')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'setup' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveView('publish')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'publish' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Publish
            </button>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="w-full max-w-4xl">
        {activeView === 'setup' ? (
          <SetupPage />
        ) : (
          <PublishPage
            selectedTag={settings.selectedTag}
            onBack={() => setActiveView('setup')}
          />
        )}
      </main>
    </div>
  )
}

export default App
