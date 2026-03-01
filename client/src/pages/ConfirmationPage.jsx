import React, { useState, useEffect, useRef } from 'react';
import { publishPost } from '../services/twitterService';
import { loadSettings } from '../services/settingsService';
import { updateBookmarkTags } from '../services/raindropioService';

const ConfirmationPage = ({ proposal, article, selectedHighlight, onBack, onNextPost }) => {
    const [postContent, setPostContent] = useState(proposal);
    const [screenshotUrl, setScreenshotUrl] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureError, setCaptureError] = useState(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState(null);
    const [publishSuccessData, setPublishSuccessData] = useState(null);
    const [tagWarning, setTagWarning] = useState(null);
    const destination = loadSettings().publishDestination === 'buffer' ? 'Buffer' : 'X (Twitter)';
    const destinationId = loadSettings().publishDestination || 'twitter';
    const bufferChannels = loadSettings().bufferChannels || [];
    const prevCaptureRef = useRef('');

    // Auto-capture screenshot on mount
    useEffect(() => {
        const captureKey = `${article.link}-${selectedHighlight || ''}`;
        if (prevCaptureRef.current === captureKey) return;
        prevCaptureRef.current = captureKey;

        const captureScreenshot = async () => {
            setIsCapturing(true);
            setCaptureError(null);
            try {
                const response = await fetch('/api/screenshot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: article.link,
                        quoteText: selectedHighlight || null,
                        author: article.extractedAuthor || article.author || null,
                        date: article.created || null,
                        coverImageUrl: article.cover || null,
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to capture screenshot');
                }

                const data = await response.json();
                setScreenshotUrl(data.screenshotUrl);
            } catch (err) {
                console.error("Screenshot capture error:", err);
                setCaptureError('Could not capture screenshot. You can still publish without an image.');
            } finally {
                setIsCapturing(false);
            }
        };

        captureScreenshot();
    }, [article, selectedHighlight]);

    const handlePublish = async () => {
        setIsPublishing(true);
        setPublishError(null);
        setTagWarning(null);
        try {
            // Build post text
            let fullText;
            if (screenshotUrl) {
                // Screenshot carries the quote visually — just text + URL
                fullText = `${postContent}\n\n${article.link}`;
            } else {
                // No screenshot — include the quote in the text
                const author = article.extractedAuthor || article.author;
                const quote = selectedHighlight || article.title;
                const attribution = author ? `Says ${author}: "${quote}"` : `"${quote}"`;
                fullText = `${postContent}\n\n${attribution}\n\nvia ${article.link}`;
            }
            const result = await publishPost(fullText, article.link, screenshotUrl, destinationId, bufferChannels);
            setPublishSuccessData(result);

            // Epic 5: Update tags in Raindrop.io
            const settings = loadSettings();
            const selectedTag = settings.selectedTag;
            if (selectedTag && article._id && article.tags) {
                const newTags = article.tags
                    .filter(t => t !== selectedTag)
                    .concat(`${selectedTag}_posted`);
                const tagUpdateSuccess = await updateBookmarkTags(article._id, newTags);
                if (!tagUpdateSuccess) {
                    setTagWarning('Success! Your post is live. Warning: Could not update tags in Raindrop.io.');
                }
            }
        } catch (error) {
            setPublishError(error.message || 'Failed to publish post');
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
                    {/* Post Text */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700 relative">
                        <div className="absolute top-3 left-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold px-2 py-0.5 rounded-full">
                            Post
                        </div>
                        <textarea
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            className="w-full bg-transparent border-none focus:ring-0 resize-y min-h-[100px] pl-8 pt-4 text-gray-800 dark:text-gray-200 leading-relaxed font-sans placeholder-gray-400 dark:placeholder-gray-500"
                            placeholder="Post content..."
                        />
                        <div className="mt-2 pl-8 flex justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
                            <span>{postContent.length} characters</span>
                            <span className="text-gray-400 dark:text-gray-500 truncate max-w-[60%]">{article.link}</span>
                        </div>
                    </div>

                    {/* Screenshot Preview */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">Screenshot</span>
                        </div>

                        {isCapturing ? (
                            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400 py-4">
                                <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm italic">Capturing screenshot...</span>
                            </div>
                        ) : captureError ? (
                            <p className="text-sm text-yellow-600 dark:text-yellow-400">{captureError}</p>
                        ) : screenshotUrl ? (
                            <img
                                src={screenshotUrl}
                                alt="Quote screenshot"
                                className="rounded-lg max-w-full max-h-64 object-contain border border-gray-200 dark:border-gray-700"
                            />
                        ) : null}
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
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Post Published!</h3>
                        <a
                            href={publishSuccessData.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline mb-4"
                        >
                            View on {destination}
                        </a>
                        {tagWarning && (
                            <div className="mb-4 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-sm font-medium border border-yellow-200 dark:border-yellow-800">
                                {tagWarning}
                            </div>
                        )}
                        {onNextPost && (
                            <button
                                onClick={onNextPost}
                                className="mt-2 inline-flex items-center justify-center rounded-md px-6 py-2.5 border border-transparent text-sm font-medium text-white shadow-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                            >
                                Publish next post
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-800">
                        <button
                            onClick={handlePublish}
                            disabled={isPublishing || isCapturing}
                            className="inline-flex items-center justify-center rounded-md px-6 py-2.5 border border-transparent text-sm font-medium text-white shadow-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:bg-blue-400 disabled:dark:bg-blue-900/50 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isPublishing ? 'Publishing...' : `Post to ${destination}`}
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
};

export default ConfirmationPage;
