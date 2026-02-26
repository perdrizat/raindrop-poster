import React, { useState, useEffect } from 'react';
import { selectEngagingHighlight } from '../services/aiService';
import { publishThread } from '../services/twitterService';

const ConfirmationPage = ({ proposal, article, objectives, onBack }) => {
    const [tweet1Content, setTweet1Content] = useState(proposal);
    const [tweet2Content, setTweet2Content] = useState('');
    const [isLoadingHighlight, setIsLoadingHighlight] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState(null);
    const [publishSuccessData, setPublishSuccessData] = useState(null);

    useEffect(() => {
        const determineTweet2 = async () => {
            let quote = "";
            let url = article.link;

            if (!article.highlights || article.highlights.length === 0) {
                quote = `"${article.title}"`;
            } else if (article.highlights.length === 1) {
                quote = `"${article.highlights[0].text}"`;
            } else {
                setIsLoadingHighlight(true);
                try {
                    const best = await selectEngagingHighlight(objectives || 'Create engaging tweets.', article, article.highlights);
                    quote = `"${best}"`;
                } catch (err) {
                    console.error("Failed to select highlight:", err);
                    quote = `"${article.highlights[0].text}"`;
                } finally {
                    setIsLoadingHighlight(false);
                }
            }

            const author = article.extractedAuthor || article.author;

            if (author) {
                setTweet2Content(`${quote} by ${author} via ${url}`);
            } else {
                setTweet2Content(`${quote} via ${url}`);
            }
        };

        determineTweet2();
    }, [article, objectives]);

    const handlePublish = async () => {
        setIsPublishing(true);
        setPublishError(null);
        try {
            const result = await publishThread(tweet1Content, tweet2Content);
            setPublishSuccessData(result);
        } catch (error) {
            setPublishError(error.message || 'Failed to publish thread');
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in w-full">
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Review & Publish</h2>
                    <button
                        onClick={onBack}
                        disabled={isPublishing || publishSuccessData}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
                    >
                        Back
                    </button>
                </div>

                <div className="space-y-6 mb-8">
                    {/* Tweet 1 */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700 relative">
                        <div className="absolute top-3 left-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">1</div>
                        <textarea
                            value={tweet1Content}
                            onChange={(e) => setTweet1Content(e.target.value)}
                            className="w-full bg-transparent border-none focus:ring-0 resize-y min-h-[100px] pl-8 text-gray-800 dark:text-gray-200 leading-relaxed font-sans placeholder-gray-400 dark:placeholder-gray-500"
                            placeholder="Tweet 1 content..."
                        />
                    </div>

                    {/* Tweet 2 */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700 relative">
                        <div className="absolute top-3 left-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">2</div>
                        {isLoadingHighlight ? (
                            <div className="pl-8 flex items-center gap-3 text-gray-500 dark:text-gray-400">
                                <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm italic">Loading highlight...</span>
                            </div>
                        ) : (
                            <textarea
                                value={tweet2Content}
                                onChange={(e) => setTweet2Content(e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 resize-y min-h-[100px] pl-8 text-gray-800 dark:text-gray-200 leading-relaxed font-sans placeholder-gray-400 dark:placeholder-gray-500"
                                placeholder="Tweet 2 content..."
                            />
                        )}
                    </div>
                </div>

                {publishError && (
                    <div className="mb-6 p-4 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-medium border border-red-200 dark:border-red-800">
                        {publishError}
                    </div>
                )}

                {publishSuccessData ? (
                    <div className="flex flex-col items-center justify-center py-6">
                        <svg className="w-16 h-16 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Thread Published!</h3>
                        <a
                            href={publishSuccessData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline mb-6"
                        >
                            View on Twitter
                        </a>
                    </div>
                ) : (
                    <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                        <button
                            onClick={handlePublish}
                            disabled={isPublishing || isLoadingHighlight}
                            className="inline-flex items-center justify-center rounded-md px-6 py-2.5 border border-transparent text-sm font-medium text-white shadow-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isPublishing ? 'Publishing...' : 'Post to Twitter'}
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
};

export default ConfirmationPage;
