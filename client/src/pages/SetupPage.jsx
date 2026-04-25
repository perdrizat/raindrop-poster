import React, { useState, useEffect } from 'react';
import ProviderButton from '../components/ProviderButton';
import { loadSettings, saveSettings } from '../services/settingsService';
import { login, checkAuthStatus, testConnection } from '../services/authService';
import { fetchTags } from '../services/raindropioService';
import { configureSystem, getSystemStatus } from '../services/systemService';

const SetupPage = () => {
    const [connections, setConnections] = useState({
        raindropio: false,
        venice: false,
        buffer: false,
        r2: false,
    });
    const [tags, setTags] = useState([]);
    const [selectedTag, setSelectedTag] = useState(() => loadSettings().selectedTag);
    const [publishDestination] = useState('buffer'); // Hardcoded to Buffer
    const [objectives, setObjectives] = useState(() => loadSettings().postingObjectives);

    // BYOK Config State
    const [raindropClientId, setRaindropClientId] = useState('');
    const [raindropClientSecret, setRaindropClientSecret] = useState('');
    const [veniceApiKey, setVeniceApiKey] = useState('');
    const [bufferAccessToken, setBufferAccessToken] = useState('');
    const [bufferProfileId, setBufferProfileId] = useState('');
    const [r2AccountId, setR2AccountId] = useState('');
    const [r2AccessKeyId, setR2AccessKeyId] = useState('');
    const [r2SecretAccessKey, setR2SecretAccessKey] = useState('');
    const [r2BucketName, setR2BucketName] = useState('');
    const [r2PublicUrl, setR2PublicUrl] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const [testMessage, setTestMessage] = useState(null);
    const [availableChannels, setAvailableChannels] = useState([]);
    const [bufferChannels, setBufferChannels] = useState(() => loadSettings().bufferChannels || []);

    const [sysStatus, setSysStatus] = useState(null);

    // 1. Initial Load & Auth Check
    useEffect(() => {
        // Fetch real connection status from backend session
        const verifyStatus = async () => {
            try {
                const [authStatus, systemStatus] = await Promise.all([
                    checkAuthStatus(),
                    getSystemStatus()
                ]);

                setConnections({
                    raindropio: authStatus.raindropio,
                    venice: authStatus.venice,
                    buffer: authStatus.buffer,
                    r2: authStatus.r2,
                });

                setSysStatus(systemStatus);

                if (systemStatus.raindropClientId) setRaindropClientId(systemStatus.raindropClientId);
                if (systemStatus.bufferProfileId) setBufferProfileId(systemStatus.bufferProfileId);

                // User preferences — server DB is source of truth; fall back to localStorage
                const cached = loadSettings();
                if (systemStatus.selectedTag) setSelectedTag(systemStatus.selectedTag);
                else if (cached.selectedTag) setSelectedTag(cached.selectedTag);

                if (systemStatus.postingObjectives) setObjectives(systemStatus.postingObjectives);
                else if (cached.postingObjectives) setObjectives(cached.postingObjectives);

                if (systemStatus.bufferChannels?.length) setBufferChannels(systemStatus.bufferChannels);
                else if (cached.bufferChannels?.length) setBufferChannels(cached.bufferChannels);

            } catch (error) {
                console.error('Initial load failed:', error);
            }

            // Clean up the URL if we just returned from OAuth
            const params = new URLSearchParams(window.location.search);
            if (params.get('success')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            if (params.get('error')) {
                const errParam = params.get('error');
                let errText = `Failed to connect to ${errParam}`;
                if (errParam === 'raindrop') errText = 'Raindrop.io not configured';
                setTestMessage({ type: 'error', text: errText });
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

    // 3. Fetch Buffer channels when Buffer is connected
    useEffect(() => {
        if (connections.buffer) {
            const getChannels = async () => {
                try {
                    const response = await fetch('/api/auth/buffer/test');
                    const data = await response.json();
                    if (data.success && data.channels) {
                        setAvailableChannels(data.channels);
                    }
                } catch (err) {
                    console.error('Failed to fetch Buffer channels:', err);
                }
            };
            getChannels();
        }
    }, [connections.buffer]);

    // 4. Auto-migrate legacy Buffer channels (bare string IDs or objects without `service`)
    // into enriched { id, service, name } shape once availableChannels is known. Without
    // the service field, PostPage's character-limit logic cannot apply the correct per-platform
    // budget and falls back to the strictest known limit (280 chars). Also drops entries that
    // no longer exist in Buffer so stale IDs don't keep counting against the limit.
    useEffect(() => {
        if (availableChannels.length === 0 || bufferChannels.length === 0) return;

        const byId = new Map(availableChannels.map(c => [c.id, c]));
        const reconciled = [];
        const enriched = [];  // { id, service, name } — bare/incomplete entries that gained a service
        const dropped = [];   // string id — entries no longer in Buffer
        for (const entry of bufferChannels) {
            const id = typeof entry === 'string' ? entry : entry?.id;
            const known = id ? byId.get(id) : null;
            if (!known) { dropped.push(id || '(empty)'); continue; }
            if (typeof entry === 'string' || !entry.service) {
                const next = { id: known.id, service: known.service, name: known.name };
                reconciled.push(next);
                enriched.push(next);
            } else {
                reconciled.push(entry);
            }
        }

        if (enriched.length === 0 && dropped.length === 0) return;

        for (const ch of enriched) {
            console.info(`[buffer-migrate] enriched ${ch.id} → ${ch.service} (${ch.name})`);
        }
        for (const id of dropped) {
            console.info(`[buffer-migrate] dropped ${id} (not in Buffer's available channels)`);
        }

        setBufferChannels(reconciled);
        saveSettings({ ...loadSettings(), bufferChannels: reconciled });
        configureSystem({ bufferChannels: reconciled }).catch(err => {
            console.error('Failed to persist migrated Buffer channels:', err);
        });

        const total = enriched.length + dropped.length;
        const parts = [];
        if (enriched.length) parts.push(`${enriched.length} enriched with service type`);
        if (dropped.length) parts.push(`${dropped.length} dropped (no longer in Buffer)`);
        setTestMessage({
            type: 'info',
            text: `Migrated ${total} Buffer channel${total === 1 ? '' : 's'}: ${parts.join(', ')}.`,
        });
        setTimeout(() => setTestMessage(null), 6000);
    }, [availableChannels, bufferChannels]);

    // Handlers
    const handleConnect = (providerId) => {
        // Venice and Buffer shouldn't be connected via UI as they are backend system keys
        if (providerId === 'venice' || providerId === 'buffer') return;
        login(providerId);
    };

    const handleTest = async (providerId) => {
        setTestMessage({ type: 'info', text: 'Testing connection...' });
        const result = await testConnection(providerId);

        if (result.error) {
            setTestMessage({ type: 'error', text: result.error });
        } else {
            let msg = 'Connection successful!';
            if (providerId === 'raindropio') {
                msg = `Raindrop connected as ${result.user}`;
                if (result.bookmarkCount != null) msg += ` (${result.bookmarkCount} bookmarks)`;
            }
            if (providerId === 'venice') msg = `Venice connected (${result.modelsCount} models found)`;
            if (providerId === 'buffer') msg = `Buffer connected — ${result.channelCount} channel(s) on ${result.services}`;
            if (providerId === 'r2') {
                msg = result.message || 'Cloudflare R2 connected';
                if (result.lastUpload) msg += ` — last upload ${new Date(result.lastUpload).toLocaleDateString()}`;
            }
            setTestMessage({ type: 'success', text: msg });
        }

        // Clear message after 5 seconds
        setTimeout(() => setTestMessage(null), 5000);
    };


    const handleSave = async () => {
        setIsSaving(true);
        try {
            await configureSystem({
                raindropClientId,
                raindropClientSecret,
                veniceApiKey,
                bufferAccessToken,
                bufferProfileId,
                r2AccountId,
                r2AccessKeyId,
                r2SecretAccessKey,
                r2BucketName,
                r2PublicUrl,
                selectedTag,
                postingObjectives: objectives,
                bufferChannels,
            });

            // Save UI Preferences to LocalStorage
            const success = saveSettings({
                selectedTag,
                postingObjectives: objectives,
                publishDestination,
                bufferChannels
            });

            if (success) {
                setSaveMessage('Settings saved securely! Channels and connections will now update.');

                // Re-fetch auth status to immediately reflect newly saved keys (like Buffer)
                const authStatus = await checkAuthStatus();
                setConnections(prev => ({
                    ...prev,
                    venice: authStatus.venice,
                    buffer: authStatus.buffer,
                    r2: authStatus.r2
                }));

                // Optionally clear the inputs if you don't want to leave passwords on screen
                setRaindropClientSecret('');
            } else {
                setSaveMessage('Error saving preferences to local storage.');
            }
        } catch {
            setSaveMessage('Error saving configurations to backend.');
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveMessage(''), 5000);
        }
    };

    return (
        <>
            {testMessage && (
                <div className={`fixed top-4 right-4 p-4 rounded-md shadow-lg font-medium z-50 transition-all ${testMessage.type === 'error' ? 'bg-red-100 text-red-800 border-l-4 border-red-500' :
                    testMessage.type === 'success' ? 'bg-green-100 text-green-800 border-l-4 border-green-500' :
                        'bg-blue-100 text-blue-800 border-l-4 border-blue-500'
                    }`}>
                    {testMessage.text}
                </div>
            )}
            <div className="space-y-8 animate-fade-in w-full">

                {/* Top Row: AI Prompt */}
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 mb-6">
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="objectives-input" className="text-base font-bold text-gray-900 dark:text-white">Custom AI Prompt (Objectives)</label>
                        <textarea
                            id="objectives-input"
                            rows="2"
                            value={objectives}
                            onChange={(e) => setObjectives(e.target.value)}
                            placeholder="E.g., Propose engaging social media posts that help me increase my follower count..."
                            className="block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-3 px-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-black dark:text-white transition-colors duration-200 resize-y"
                        />
                    </div>
                </section>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-8">Integration Credentials (BYOK)</h2>
                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 mb-6 rounded-r-md">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                        Enter your API keys below. Only fill in the fields you want to update. Blank fields will keep their existing values securely on the server.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Raindrop BYOK */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Raindrop.io App {sysStatus?.hasRaindropConfig && <span className="text-green-500 text-sm ml-2">✓ Configured</span>}</h3>
                        <div className="space-y-3 flex-grow">
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Client ID</label>
                                <input type="text" value={raindropClientId} onChange={e => setRaindropClientId(e.target.value)} placeholder="Enter Client ID" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Client Secret</label>
                                <input type="password" value={raindropClientSecret} onChange={e => setRaindropClientSecret(e.target.value)} placeholder="Enter Client Secret" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                        </div>
                    </section>

                    {/* Venice AI BYOK */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Venice AI</h3>
                        <div className="space-y-3 flex-grow">
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Venice API Key {connections.venice && <span className="text-green-500">✓</span>}</label>
                                <input type="password" value={veniceApiKey} onChange={e => setVeniceApiKey(e.target.value)} placeholder="Enter Venice API Key" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                        </div>
                    </section>

                    {/* Cloudflare R2 BYOK */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cloudflare R2 {sysStatus?.hasR2Config && <span className="text-green-500 text-sm ml-2">✓ Configured</span>}</h3>
                        <div className="space-y-3 flex-grow">
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Account ID</label>
                                <input type="text" value={r2AccountId} onChange={e => setR2AccountId(e.target.value)} placeholder="Enter Account ID" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Access Key ID</label>
                                <input type="password" value={r2AccessKeyId} onChange={e => setR2AccessKeyId(e.target.value)} placeholder="Enter Access Key ID" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Secret Access Key</label>
                                <input type="password" value={r2SecretAccessKey} onChange={e => setR2SecretAccessKey(e.target.value)} placeholder="Enter Secret Access Key" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Bucket Name</label>
                                <input type="text" value={r2BucketName} onChange={e => setR2BucketName(e.target.value)} placeholder="Enter Bucket Name" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Public URL</label>
                                <input type="text" value={r2PublicUrl} onChange={e => setR2PublicUrl(e.target.value)} placeholder="https://pub-xxx.r2.dev" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                        </div>
                    </section>

                    {/* Buffer BYOK */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Buffer Configuration</h3>
                        <div className="space-y-3 flex-grow">
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Organization / Profile ID</label>
                                <input type="text" value={bufferProfileId} onChange={e => setBufferProfileId(e.target.value)} placeholder="Enter Profile/Org ID" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Access Token {connections.buffer && <span className="text-green-500 text-sm ml-2">✓ Configured</span>}</label>
                                <input type="password" value={bufferAccessToken} onChange={e => setBufferAccessToken(e.target.value)} placeholder="Enter Access Token" className="mt-1 block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2 px-3 text-sm focus:border-blue-500 focus:outline-none dark:bg-black dark:text-white" />
                            </div>
                        </div>
                    </section>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 mt-12">User Workflows & Connections</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* COLUMN 1: Bookmarks */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4 transition-colors duration-300">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bookmarks</h2>

                        <div className="flex flex-col space-y-4 flex-grow">
                            <ProviderButton
                                providerName="Raindrop.io"
                                providerId="raindropio"
                                isConnected={connections.raindropio}
                                onConnect={handleConnect}
                                onTest={handleTest}
                            />

                            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                <label htmlFor="tag-select" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Raindrop Tag (Queue)</label>
                                <div className="relative">
                                    <select
                                        id="tag-select"
                                        value={selectedTag}
                                        onChange={(e) => setSelectedTag(e.target.value)}
                                        disabled={!connections.raindropio || tags.length === 0}
                                        className="block w-full rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 py-2.5 pl-3 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-black dark:text-white disabled:opacity-50 transition-colors duration-200"
                                    >
                                        {!connections.raindropio && <option value="">Connect first...</option>}
                                        {connections.raindropio && tags.length === 0 && <option value="">Loading...</option>}
                                        {connections.raindropio && tags.map(tag => (
                                            <option key={tag} value={tag}>{tag}</option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* COLUMN 2: Connections */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4 transition-colors duration-300">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Services</h2>

                        <div className="flex flex-col space-y-4 flex-grow">
                            <ProviderButton
                                providerName="Venice.ai"
                                providerId="venice"
                                isConnected={connections.venice}
                                onConnect={() => { }}
                                onTest={handleTest}
                            />

                            <ProviderButton
                                providerName="Cloudflare R2"
                                providerId="r2"
                                isConnected={connections.r2}
                                onConnect={() => { }}
                                onTest={handleTest}
                            />
                        </div>
                    </section>

                    {/* COLUMN 3: Publishing */}
                    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 flex flex-col space-y-4 transition-colors duration-300">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Publishing</h2>

                        <div className="flex flex-col space-y-4 flex-grow">
                            <ProviderButton
                                providerName="Buffer.com"
                                providerId="buffer"
                                isConnected={connections.buffer}
                                onConnect={() => { }} // Controlled by BYOK input fields
                                onTest={handleTest}
                            />

                            {availableChannels.length > 0 && (
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Buffer Channels</label>
                                    <div className="space-y-2">
                                        {availableChannels.map(ch => (
                                            <label key={ch.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={bufferChannels.some(c => (typeof c === 'string' ? c : c.id) === ch.id)}
                                                    onChange={(e) => {
                                                        setBufferChannels(prev =>
                                                            e.target.checked
                                                                ? [...prev, { id: ch.id, service: ch.service, name: ch.name }]
                                                                : prev.filter(c => (typeof c === 'string' ? c : c.id) !== ch.id)
                                                        );
                                                    }}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                {ch.service}: {ch.name}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-end mt-6 space-x-4">
                    {saveMessage && (
                        <div className={`text-sm font-medium ${saveMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                            {saveMessage}
                        </div>
                    )}
                    <button
                        className={`inline-flex items-center justify-center rounded-md px-6 py-3 border border-transparent text-base font-medium text-white shadow-sm transition-all duration-200 ${isSaving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-gray-400 dark:disabled:bg-gray-700'}`}
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
        </>
    );
};

export default SetupPage;
