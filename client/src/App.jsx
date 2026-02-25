import SetupPage from './pages/SetupPage'
import ThemeToggle from './components/ThemeToggle'

function App() {
  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8">
      <header className="w-full max-w-4xl flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Raindrop Publisher Setup
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Connect your accounts and configure your publishing workflow
          </p>
        </div>
        <ThemeToggle />
      </header>

      <main className="w-full max-w-4xl">
        <SetupPage />
      </main>
    </div>
  )
}

export default App
