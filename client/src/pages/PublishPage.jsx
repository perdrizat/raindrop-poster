import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchTaggedItems } from '../services/raindropioService';
import { generateProposals } from '../services/aiService';
import { loadSettings } from '../services/settingsService';

const PublishPage = ({ selectedTag, onSelectProposal }) => {
    const [articles, setArticles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [proposals, setProposals] = useState([]);
    const [extractedAuthor, setExtractedAuthor] = useState(null);
    const [generationError, setGenerationError] = useState(null);

    const currentArticle = articles.length > 0 && currentIndex >= 0 && currentIndex < articles.length
        ? articles[currentIndex]
        : null;

    const triggerGeneration = useCallback(async (article) => {
        if (!article) return;
        setIsGenerating(true);
        setGenerationError(null);
        setProposals([]);
        try {
            const settings = loadSettings();
            const customPrompt = settings.postingObjectives || 'Create engaging tweets.';

            const results = await generateProposals(article, customPrompt);
            setProposals(results.proposals || []);
            setExtractedAuthor(results.author || null);
        } catch (error) {
            setGenerationError(error.message || 'Failed to generate proposals.');
        } finally {
            setIsGenerating(false);
        }
    }, []);

    const lastGeneratedRef = useRef(null);

    useEffect(() => {
        if (currentArticle && lastGeneratedRef.current !== currentArticle._id) {
            lastGeneratedRef.current = currentArticle._id;
            triggerGeneration(currentArticle);
        }
    }, [currentArticle, triggerGeneration]);

    const loadArticles = useCallback(async () => {
        setIsLoading(true);
        try {
            const items = await fetchTaggedItems(selectedTag);
            setArticles(items);
            setCurrentIndex(0);
        } catch (error) {
            console.error("Failed to load articles", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedTag]);

    useEffect(() => {
        if (selectedTag) {
            loadArticles();
        }
    }, [selectedTag, loadArticles]);

    const header = (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Publish Queue: {selectedTag}</h2>
            </div>
            {articles.length > 0 && (
                <div className="text-sm font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                    {currentIndex + 1} of {articles.length}
                </div>
            )}
        </div>
    );

    if (isLoading) {
        return (
            <div className="space-y-8 animate-fade-in w-full">
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                    {header}
                    <div className="flex justify-center items-center py-12">
                        <div className="flex flex-col items-center">
                            <svg className="animate-spin h-8 w-8 text-blue-500 mb-4" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="text-gray-500 dark:text-gray-400">Loading articles...</p>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    if (articles.length === 0) {
        return (
            <div className="space-y-8 animate-fade-in w-full">
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                    {header}
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Empty Queue</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">No articles found for tag "{selectedTag}".</p>
                        <button
                            onClick={loadArticles}
                            className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white shadow-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                        >
                            Reload Raindrops
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in w-full">
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                {header}

                <div className="flex flex-col gap-4 mb-8 bg-gray-50 dark:bg-black rounded-md border border-gray-200 dark:border-gray-800 p-4 sm:p-6 transition-colors duration-200">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                        {currentArticle.title}
                    </h3>
                    <a
                        href={currentArticle.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                        {currentArticle.link}
                    </a>

                    {currentArticle.highlights && currentArticle.highlights.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                            <h4 className="text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-3">
                                Highlights
                            </h4>
                            <ul className="space-y-3 pl-4 list-disc text-gray-700 dark:text-gray-300 pr-2">
                                {currentArticle.highlights.map((highlight, idx) => (
                                    <li key={idx} className="leading-relaxed">"{highlight.text}"</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        AI Proposals
                    </h3>

                    {isGenerating ? (
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 flex flex-col items-center justify-center border border-gray-100 dark:border-gray-800">
                            <svg className="animate-spin h-6 w-6 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Generating proposals...</p>
                        </div>
                    ) : generationError ? (
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 border border-red-100 dark:border-red-800 flex flex-col items-center text-center">
                            <svg className="w-8 h-8 text-red-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-red-700 dark:text-red-400 font-medium mb-4">{generationError}</p>
                            <button
                                onClick={() => triggerGeneration(currentArticle)}
                                className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900 rounded-md text-sm font-medium transition-colors"
                            >
                                Retry Generation
                            </button>
                        </div>
                    ) : proposals?.length > 0 ? (
                        <div className="space-y-4">
                            {proposals.map((proposal, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative group">
                                    <div className="absolute top-3 left-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                                        {idx + 1}
                                    </div>
                                    <p className="text-gray-800 dark:text-gray-200 pl-8 whitespace-pre-wrap leading-relaxed">{proposal}</p>

                                    <div className="mt-4 pl-8 flex justify-end">
                                        <button
                                            onClick={() => onSelectProposal(proposal, { ...currentArticle, extractedAuthor })}
                                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                                        >
                                            Review & Publish Thread
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800 gap-4">
                    <button
                        onClick={() => setCurrentIndex(prev => prev - 1)}
                        disabled={currentIndex === 0}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white transition-all duration-200 bg-blue-600 hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        Newer
                    </button>

                    <button
                        onClick={() => triggerGeneration(currentArticle)}
                        disabled={isGenerating || !currentArticle}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? 'Generating...' : 'Regenerate Proposals'}
                    </button>

                    <button
                        onClick={() => setCurrentIndex(prev => prev + 1)}
                        disabled={currentIndex === articles.length - 1}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white transition-all duration-200 bg-blue-600 hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        Older
                    </button>
                </div>
            </section>
        </div>
    );
};

export default PublishPage;
