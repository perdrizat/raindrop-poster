import React, { useState, useEffect, useRef } from 'react';
import { publishPost } from '../services/publishService';
import { loadSettings } from '../services/settingsService';
import { updateBookmarkTags } from '../services/raindropioService';
import { resizeImage } from '../utils/imageUtils';

const ConfirmationPage = ({ proposal, article, onBack, onNextPost }) => {
    const [postContent, setPostContent] = useState(proposal);
    const [quote, setQuote] = useState(article.highlight || '');
    const [localQuote, setLocalQuote] = useState(article.highlight || '');

    // Image option state
    const [screenshotData, setScreenshotData] = useState(null);
    const [coverUrl] = useState(article.cover || null);
    const [aiImageData, setAiImageData] = useState(null);
    const [customImageData, setCustomImageData] = useState(null);
    const [selectedOption, setSelectedOption] = useState('screenshot');

    // Loading/error state per option
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureError, setCaptureError] = useState(null);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [aiError, setAiError] = useState(null);
    const [isUploadingCustom, setIsUploadingCustom] = useState(false);
    const [customError, setCustomError] = useState(null);

    const [isPublishing, setIsPublishing] = useState(false);
    const [publishError, setPublishError] = useState(null);
    const [publishSuccessData, setPublishSuccessData] = useState(null);
    const [tagWarning, setTagWarning] = useState(null);

    // Initial domain extraction
    const initialDomain = (() => {
        try {
            return new URL(article.link).hostname.replace('www.', '');
        } catch {
            return '';
        }
    })();

    const [author, setAuthor] = useState(article.extractedAuthor || article.author || '');
    const [date, setDate] = useState(article.created ? new Date(article.created).toLocaleDateString() : '');
    const [domain, setDomain] = useState(initialDomain);
    const [bufferMode, setBufferMode] = useState('draft');

    const destination = 'Buffer';
    const destinationId = 'buffer';
    const rawChannels = loadSettings().bufferChannels || [];
    // Support both legacy (string IDs) and new (channel objects) formats
    const bufferChannelObjects = rawChannels.map(ch => typeof ch === 'string' ? { id: ch } : ch);
    const bufferChannelIds = bufferChannelObjects.map(ch => ch.id);
    const prevCaptureRef = useRef('');

    // Estimate the full post length (postContent + URL + attribution) for char limit checks.
    // Must mirror the fullText logic in handlePublish so the check matches what Buffer receives.
    const { imageData: selImageData, coverUrl: selCoverUrl } = (() => {
        switch (selectedOption) {
            case 'cover': return { imageData: null, coverUrl: coverUrl };
            case 'screenshot': return { imageData: screenshotData, coverUrl: null };
            case 'ai': return { imageData: aiImageData, coverUrl: null };
            case 'custom': return { imageData: customImageData, coverUrl: null };
            default: return { imageData: null, coverUrl: null };
        }
    })();
    const hasSelectedImage = !!(selImageData || selCoverUrl);
    const estimatedFullText = hasSelectedImage
        ? `${postContent}\n\n${article.link}`
        : (() => {
            const attrAuthor = author || article.extractedAuthor || article.author;
            const fullQuote = quote || article.title;
            const attr = attrAuthor ? `Says ${attrAuthor}: "${fullQuote}"` : `"${fullQuote}"`;
            return `${postContent}\n\n${attr}\n\nvia ${article.link}`;
        })();

    // Character limit warnings per platform
    const CHAR_LIMITS = { bluesky: 300, mastodon: 500 };
    const charWarnings = bufferChannelObjects
        .filter(ch => ch.service && CHAR_LIMITS[ch.service] && estimatedFullText.length > CHAR_LIMITS[ch.service])
        .map(ch => ({ service: ch.service, limit: CHAR_LIMITS[ch.service] }))
        // dedupe by service
        .filter((w, i, arr) => arr.findIndex(x => x.service === w.service) === i);

    const captureScreenshot = async (force = false) => {
        const captureKey = `${article.link}-${quote}-${author}-${date}-${domain}`;
        if (!force && prevCaptureRef.current === captureKey) return;
        prevCaptureRef.current = captureKey;

        setIsCapturing(true);
        setCaptureError(null);
        try {
            const response = await fetch('/api/screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: article.link,
                    quoteText: quote || null,
                    author: author,
                    date: date,
                    domain: domain,
                    coverImageUrl: article.cover || null,
                    articleHtml: article.scrapeData?.html || null,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to capture screenshot');
            }

            const data = await response.json();
            if (data.imageData) {
                setScreenshotData(data.imageData);
            } else if (data.coverUrl) {
                // Screenshot service returned a cover URL shortcut — put it in screenshot slot
                setScreenshotData(null);
            }
        } catch (err) {
            console.error("Screenshot capture error:", err);
            setCaptureError('Could not capture screenshot.');
        } finally {
            setIsCapturing(false);
        }
    };

    const generateAiImage = async () => {
        setIsGeneratingAi(true);
        setAiError(null);
        try {
            const settings = loadSettings();
            const response = await fetch('/api/venice/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: `Roy Lichtenstein pop art style comic book panel featuring a large speech bubble with the text: '${quote || article.title}' Style elements: Bold black outlines, Ben-Day dot patterns for shading, vibrant primary colors (red, blue, yellow), clean graphic composition. Speech bubble has thick black borders and classic comic book font. Background is solid red with subtle halftone dot texture. No gradients or soft shading. High-contrast, flat colors. Comic book aesthetic with precise geometric shapes.`,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate AI image');
            }

            const data = await response.json();
            setAiImageData(data.imageData);
        } catch (err) {
            console.error("AI image generation error:", err);
            setAiError('Could not generate AI image.');
        } finally {
            setIsGeneratingAi(false);
        }
    };

    // Auto-capture screenshot on mount
    useEffect(() => {
        captureScreenshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleImageUpload = async (file) => {
        if (!file || !file.type.startsWith('image/')) return;

        setIsUploadingCustom(true);
        setCustomError(null);

        try {
            const base64Image = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });

            const resized = await resizeImage(base64Image);
            setCustomImageData(resized);
            setSelectedOption('custom');
        } catch (error) {
            console.error('Upload Error:', error);
            setCustomError(error.message);
        } finally {
            setIsUploadingCustom(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        handleImageUpload(file);
    };

    const handlePaste = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleImageUpload(file);
                break;
            }
        }
    };

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Resolve selected image for publishing
    const getSelectedImage = () => {
        switch (selectedOption) {
            case 'cover': return { imageData: null, coverUrl: coverUrl };
            case 'screenshot': return { imageData: screenshotData, coverUrl: null };
            case 'ai': return { imageData: aiImageData, coverUrl: null };
            case 'custom': return { imageData: customImageData, coverUrl: null };
            default: return { imageData: null, coverUrl: null };
        }
    };

    const handlePublish = async (overrideBufferMode = null) => {
        setIsPublishing(true);
        setPublishError(null);
        setTagWarning(null);
        const modeToUse = overrideBufferMode || bufferMode;
        if (overrideBufferMode) {
            setBufferMode(overrideBufferMode);
        }
        try {
            const { imageData, coverUrl: publishCoverUrl } = getSelectedImage();
            const hasImage = !!(imageData || publishCoverUrl);
            let fullText;
            if (hasImage) {
                fullText = `${postContent}\n\n${article.link}`;
            } else {
                const attributionAuthor = author || article.extractedAuthor || article.author;
                const fullQuote = quote || article.title;
                const attribution = attributionAuthor ? `Says ${attributionAuthor}: "${fullQuote}"` : `"${fullQuote}"`;
                fullText = `${postContent}\n\n${attribution}\n\nvia ${article.link}`;
            }
            const result = await publishPost(fullText, article.link, { imageData, coverUrl: publishCoverUrl }, destinationId, bufferChannelIds, modeToUse);
            setPublishSuccessData(result);

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

    const isAnyLoading = isCapturing || isGeneratingAi || isUploadingCustom;
    const hasCharLimitViolation = charWarnings.length > 0;

    // Reusable image option card
    const ImageCard = ({ id, label, imageSrc, isLoading, error, onRetry, disabled, placeholder, onActivate }) => {
        const isSelected = selectedOption === id;
        const hasImage = !!imageSrc;
        const canSelect = hasImage || id === 'cover';

        const handleClick = () => {
            if (disabled) return;
            if (canSelect) {
                setSelectedOption(id);
            } else if (onActivate && !isLoading) {
                onActivate();
            }
        };

        return (
            <div
                data-testid={`image-option-${id}`}
                onClick={handleClick}
                className={`aspect-square rounded-lg border-2 overflow-hidden flex flex-col cursor-pointer transition-all duration-200
                    ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200 dark:border-gray-700'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300 dark:hover:border-blue-600'}
                    bg-gray-50 dark:bg-gray-800/50`}
            >
                <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">{label}</span>
                    {onRetry && error && (
                        <button onClick={(e) => { e.stopPropagation(); onRetry(); }} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700">
                            Retry
                        </button>
                    )}
                </div>
                <div className="flex-1 flex items-center justify-center p-2 min-h-0">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-gray-400">
                            <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-xs italic">Loading...</span>
                        </div>
                    ) : error ? (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 text-center px-2">{error}</p>
                    ) : imageSrc ? (
                        <img src={imageSrc} alt={label} className="max-w-full max-h-full object-contain rounded" />
                    ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 text-center px-2">{placeholder || 'No image'}</span>
                    )}
                </div>
            </div>
        );
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
                            <a href={article.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 dark:text-blue-400 hover:underline truncate max-w-[60%]">{article.link}</a>
                        </div>
                        {charWarnings.length > 0 && (
                            <div className="mt-2 pl-8 space-y-1">
                                {charWarnings.map(w => (
                                    <p key={w.service} className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                        Full post ({estimatedFullText.length} chars) exceeds {w.service.charAt(0).toUpperCase() + w.service.slice(1)}'s {w.limit}-character limit
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quote Text (Editable) */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                        <label className="flex items-center gap-2 mb-3 cursor-pointer" htmlFor="quote-editor">
                            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">Quote (Highlight)</span>
                        </label>
                        <textarea
                            id="quote-editor"
                            value={localQuote}
                            onChange={(e) => setLocalQuote(e.target.value)}
                            onBlur={() => setQuote(localQuote)}
                            className="w-full bg-transparent border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-3 resize-y min-h-[80px] text-gray-800 dark:text-gray-200 leading-relaxed font-sans placeholder-gray-400 dark:placeholder-gray-500 mb-4"
                            placeholder="Quote text for screenshot..."
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-1" htmlFor="author-input">Author</label>
                                <input id="author-input" type="text" value={author} onChange={e => setAuthor(e.target.value)} onBlur={() => captureScreenshot()} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2 text-sm text-gray-800 dark:text-gray-200" placeholder="Author name" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-1" htmlFor="date-input">Date</label>
                                <input id="date-input" type="text" value={date} onChange={e => setDate(e.target.value)} onBlur={() => captureScreenshot()} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2 text-sm text-gray-800 dark:text-gray-200" placeholder="Publication date" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-1" htmlFor="domain-input">Publication / Domain</label>
                                <input id="domain-input" type="text" value={domain} onChange={e => setDomain(e.target.value)} onBlur={() => captureScreenshot()} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2 text-sm text-gray-800 dark:text-gray-200" placeholder="Domain name" />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button onClick={() => captureScreenshot(true)} disabled={isCapturing} className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-50">
                                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Regenerate Screenshot
                            </button>
                        </div>
                    </div>

                    {/* Image Options — 2x2 Grid */}
                    <div
                        className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase">Image Options</span>
                            </div>
                            <label className="cursor-pointer text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                                Upload Custom Image
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => handleImageUpload(e.target.files[0])}
                                />
                            </label>
                        </div>
                        <div className="text-xs text-center text-gray-400 dark:text-gray-500 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 border-dashed">
                            Paste an image from clipboard or drag and drop to upload
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <ImageCard
                                id="cover"
                                label="Cover"
                                imageSrc={coverUrl}
                                isLoading={false}
                                error={null}
                                disabled={!coverUrl}
                                placeholder="No cover available"
                            />
                            <ImageCard
                                id="screenshot"
                                label="Screenshot"
                                imageSrc={screenshotData}
                                isLoading={isCapturing}
                                error={captureError}
                                onRetry={() => captureScreenshot(true)}
                            />
                            <ImageCard
                                id="ai"
                                label="AI Generated"
                                imageSrc={aiImageData}
                                isLoading={isGeneratingAi}
                                error={aiError}
                                onRetry={() => generateAiImage()}
                                onActivate={() => { setSelectedOption('ai'); generateAiImage(); }}
                                placeholder="Click to generate"
                            />
                            <ImageCard
                                id="custom"
                                label="Custom"
                                imageSrc={customImageData}
                                isLoading={isUploadingCustom}
                                error={customError}
                                placeholder="Paste or upload"
                            />
                        </div>
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
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Save to Buffer:</span>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => handlePublish('now')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white shadow-sm transition-all duration-200 bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isPublishing && bufferMode === 'now' ? '...' : 'Now'}
                            </button>
                            <button
                                onClick={() => handlePublish('prioritize')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white shadow-sm transition-all duration-200 bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isPublishing && bufferMode === 'prioritize' ? '...' : 'Prioritize'}
                            </button>
                            <button
                                onClick={() => handlePublish('next')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                            >
                                {isPublishing && bufferMode === 'next' ? '...' : 'Next Available'}
                            </button>
                            <button
                                onClick={() => handlePublish('draft')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                            >
                                {isPublishing && bufferMode === 'draft' ? '...' : 'Drafts'}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default ConfirmationPage;
