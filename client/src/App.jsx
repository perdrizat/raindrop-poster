import React, { useState } from 'react'
import SetupPage from './pages/SetupPage'
import PublishPage from './pages/PublishPage'
import ConfirmationPage from './pages/ConfirmationPage'
import ThemeToggle from './components/ThemeToggle'
import { loadSettings } from './services/settingsService'

function App() {
  const [confirmationData, setConfirmationData] = useState(null)
  const settings = loadSettings()
  const [activeView, setActiveView] = useState(settings.selectedTag ? 'publish' : 'setup')

  const handleSelectProposal = (proposal, article) => {
    setConfirmationData({ proposal, article })
    setActiveView('confirmation')
  }

  const handleBackFromConfirmation = () => {
    setActiveView('publish')
    setConfirmationData(null)
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <header className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <button onClick={() => setActiveView('publish')} className="text-left focus:outline-none">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Raindrop Poster
            </h1>
          </button>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {activeView === 'setup' ? 'Configure your integrations and workflow.' : 'Curate and publish your content.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <nav className="flex space-x-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveView('publish')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'publish' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Queue
            </button>
            <button
              onClick={() => setActiveView('setup')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeView === 'setup' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              Settings
            </button>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main className="w-full max-w-4xl">
        {activeView === 'setup' && <SetupPage />}

        {activeView === 'publish' && (
          <PublishPage
            selectedTag={settings.selectedTag}
            onSelectProposal={handleSelectProposal}
          />
        )}

        {activeView === 'confirmation' && confirmationData && (
          <ConfirmationPage
            proposal={confirmationData.proposal}
            article={confirmationData.article}
            objectives={settings.postingObjectives}
            onBack={handleBackFromConfirmation}
          />
        )}
      </main>
    </div>
  )
}

export default App
