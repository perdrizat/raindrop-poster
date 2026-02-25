import React, { useState, useEffect, useCallback } from 'react';
import { fetchTaggedItems } from '../services/raindropioService';

const PublishPage = ({ selectedTag }) => {
    const [articles, setArticles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);

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

    const currentArticle = articles[currentIndex];

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

                <div className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-800 gap-4">
                    <button
                        onClick={() => setCurrentIndex(prev => prev - 1)}
                        disabled={currentIndex === 0}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white transition-all duration-200 bg-blue-600 hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        Newer
                    </button>

                    <button
                        onClick={loadArticles}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        Reload
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
