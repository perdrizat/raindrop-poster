import React, { useState, useEffect } from 'react';
import ProviderButton from '../components/ProviderButton';
import { loadSettings, saveSettings } from '../services/settingsService';
import { login, checkAuthStatus, testConnection } from '../services/authService';
import { fetchTags } from '../services/raindropioService';

const SetupPage = () => {
    const [connections, setConnections] = useState({
        raindropio: false,
        twitter: false,
        venice: false
    });
    const [tags, setTags] = useState([]);
    const [selectedTag, setSelectedTag] = useState(() => loadSettings().selectedTag);
    const [objectives, setObjectives] = useState(() => loadSettings().postingObjectives);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [testMessage, setTestMessage] = useState(null);

    // 1. Initial Load & Auth Check
    useEffect(() => {
        // Fetch real connection status from backend session
        const verifyStatus = async () => {
            const status = await checkAuthStatus();
            setConnections({
                raindropio: status.raindropio,
                twitter: status.twitter,
                venice: status.venice
            });

            // Clean up the URL if we just returned from OAuth
            const params = new URLSearchParams(window.location.search);
            if (params.get('success')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (params.get('error')) {
                setTestMessage({ type: 'error', text: `Failed to connect to ${params.get('error')}` });
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        };
        verifyStatus();
    }, []);

    // 2. Fetch tags when Raindrop connects
    useEffect(() => {
        if (connections.raindropio) {
            const getTags = async () => {
                const fetchedTags = await fetchTags();
                setTags(fetchedTags);
                setTags(fetchedTags);
                // If we don't have a tag selected, pick the first one by default
                setSelectedTag(prev => prev || (fetchedTags.length > 0 ? fetchedTags[0] : ''));
            };
            getTags();
        }
    }, [connections.raindropio]); // Only re-run if raindrop connection status changes

    // Handlers
    const handleConnect = (providerId) => {
        // Venice shouldn't be connected here as it's a backend system key
        if (providerId === 'venice') return;
        login(providerId);
    };

    const handleTest = async (providerId) => {
        setTestMessage({ type: 'info', text: 'Testing connection...' });
        const result = await testConnection(providerId);

        if (result.error) {
            setTestMessage({ type: 'error', text: result.error });
        } else {
            let msg = 'Connection successful!';
            if (providerId === 'twitter') msg = `Twitter connected as @${result.username}`;
            if (providerId === 'raindropio') msg = `Raindrop connected as ${result.user}`;
            if (providerId === 'venice') msg = `Venice connected (${result.modelsCount} models found)`;
            setTestMessage({ type: 'success', text: msg });
        }

        // Clear message after 5 seconds
        setTimeout(() => setTestMessage(null), 5000);
    };

    const handleSave = () => {
        setIsSaving(true);
        const success = saveSettings({
            selectedTag,
            postingObjectives: objectives
        });

        setTimeout(() => {
            setIsSaving(false);
            setSaveMessage(success ? 'Settings saved securely!' : 'Error saving settings.');
            setTimeout(() => setSaveMessage(''), 3000);
        }, 600);
    };

    return (
        <div className="space-y-8 animate-fade-in w-full">
            {testMessage && (
                <div className={`fixed top-4 right-4 p-4 rounded-md shadow-lg font-medium z-50 transition-all ${testMessage.type === 'error' ? 'bg-red-100 text-red-800 border-l-4 border-red-500' :
                    testMessage.type === 'success' ? 'bg-green-100 text-green-800 border-l-4 border-green-500' :
                        'bg-blue-100 text-blue-800 border-l-4 border-blue-500'
                    }`}>
                    {testMessage.text}
                </div>
            )}

            {/* SECTION 1: API Connections */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">1. Connect Services</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Authenticate your essential accounts via OAuth.</p>

                <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    <ProviderButton
                        providerName="Raindrop.io"
                        providerId="raindropio"
                        isConnected={connections.raindropio}
                        onConnect={handleConnect}
                        onTest={handleTest}
                    />
                    <ProviderButton
                        providerName="X (Twitter)"
                        providerId="twitter"
                        isConnected={connections.twitter}
                        onConnect={handleConnect}
                        onTest={handleTest}
                    />
                    <ProviderButton
                        providerName="Venice.ai"
                        providerId="venice"
                        isConnected={connections.venice}
                        onConnect={() => { }} // Controlled by backend env var
                        onTest={handleTest}
                    />
                </div>
            </section>

            {/* SECTION 2: Publishing Queue */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">2. Content Queue</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Select the Raindrop tag that will feed your publishing queue.</p>

                <div className="flex flex-col space-y-2">
                    <label htmlFor="tag-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">Raindrop Tag</label>
                    <div className="relative">
                        <select
                            id="tag-select"
                            value={selectedTag}
                            onChange={(e) => setSelectedTag(e.target.value)}
                            disabled={!connections.raindropio || tags.length === 0}
                            className="block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2.5 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-black dark:text-white disabled:opacity-50 transition-colors duration-200"
                        >
                            {!connections.raindropio && <option value="">Connect Raindrop first...</option>}
                            {connections.raindropio && tags.length === 0 && <option value="">Loading tools...</option>}
                            {connections.raindropio && tags.map(tag => (
                                <option key={tag} value={tag}>{tag}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </div>
                    </div>
                </div>
            </section>

            {/* SECTION 3: AI Settings */}
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">3. Posting Objectives</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">Provide context for the AI when drafting posts from your saved articles.</p>

                <div className="flex flex-col space-y-2">
                    <textarea
                        id="objectives-input"
                        rows="4"
                        value={objectives}
                        onChange={(e) => setObjectives(e.target.value)}
                        placeholder="E.g., Propose engaging Twitter posts that help me increase my follower count..."
                        className="block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-3 px-4 text-base focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-black dark:text-white transition-colors duration-200 resize-y"
                    />
                </div>
            </section>

            {/* FOOTER: Save Action */}
            <div className="flex items-center justify-end pt-4 space-x-4">
                {saveMessage && (
                    <div className={`text-sm font-medium ${saveMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                        {saveMessage}
                    </div>
                )}
                <button
                    className={`inline-flex items-center justify-center rounded-md px-6 py-3 border border-transparent text-base font-medium text-white shadow-sm transition-all duration-200 
                    ${isSaving
                            ? 'bg-blue-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-gray-400 dark:disabled:bg-gray-700'
                        }`}
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                        </>
                    ) : 'Save Configuration'}
                </button>
            </div>

        </div>
    );
};

export default SetupPage;
