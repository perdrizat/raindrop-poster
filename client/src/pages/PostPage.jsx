import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import { fetchTaggedItems, updateBookmarkTags } from '../services/raindropioService';
import { generateProposals } from '../services/aiService';
import { publishPost } from '../services/publishService';
import { loadSettings } from '../services/settingsService';
import BookmarkNav from '../components/BookmarkNav';
import PublishOverlay from '../components/PublishOverlay';
import { resizeImage } from '../utils/imageUtils';

const parseHashIndex = () => {
    const raw = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
};

const escapeHtml = (s) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const getCursorOffsetIn = (el) => {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.endContainer)) return 0;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
};

const setCursorOffsetIn = (el, offset) => {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel) return;
    const range = document.createRange();
    let remaining = offset;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    let placed = false;
    while ((node = walker.nextNode())) {
        const len = node.textContent.length;
        if (remaining <= len) {
            range.setStart(node, remaining);
            range.setEnd(node, remaining);
            placed = true;
            break;
        }
        remaining -= len;
    }
    if (!placed) {
        range.selectNodeContents(el);
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
};

// Contenteditable post editor with inline red highlight for characters past the limit.
// The highlight is part of the text flow (an actual <span> inside the editor), not an overlay.
const HighlightedPostEditor = forwardRef(({ id, value, onChange, maxAllowedLen, placeholder, className }, ref) => {
    const elRef = useRef(null);

    const hasOverage = maxAllowedLen != null && value.length > maxAllowedLen;
    const desiredHtml = hasOverage
        ? `${escapeHtml(value.slice(0, maxAllowedLen))}<span data-testid="post-overage-highlight" class="bg-red-200 dark:bg-red-900/50 rounded-sm">${escapeHtml(value.slice(maxAllowedLen))}</span>`
        : escapeHtml(value);

    useLayoutEffect(() => {
        const el = elRef.current;
        if (!el) return;
        if (el.innerHTML === desiredHtml) return;
        const isFocused = document.activeElement === el;
        const savedOffset = isFocused ? getCursorOffsetIn(el) : null;
        el.innerHTML = desiredHtml;
        if (savedOffset !== null) setCursorOffsetIn(el, savedOffset);
    }, [desiredHtml]);

    useImperativeHandle(ref, () => ({
        focus: () => elRef.current?.focus(),
        element: () => elRef.current,
        getCursorOffset: () => {
            const el = elRef.current;
            return el ? getCursorOffsetIn(el) : 0;
        },
        setCursorOffset: (offset) => {
            const el = elRef.current;
            if (el) setCursorOffsetIn(el, offset);
        },
    }), []);

    const handleInput = (e) => {
        onChange(e.currentTarget.textContent || '');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const el = elRef.current;
            if (!el) return;
            const offset = getCursorOffsetIn(el);
            const next = value.slice(0, offset) + '\n' + value.slice(offset);
            onChange(next);
            requestAnimationFrame(() => {
                if (elRef.current) setCursorOffsetIn(elRef.current, offset + 1);
            });
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
        const el = e.currentTarget;
        const offset = getCursorOffsetIn(el);
        const next = value.slice(0, offset) + text + value.slice(offset);
        onChange(next);
        requestAnimationFrame(() => {
            if (elRef.current) setCursorOffsetIn(elRef.current, offset + text.length);
        });
    };

    return (
        <div className="relative flex-1">
            {!value && placeholder && (
                <div
                    aria-hidden="true"
                    className="absolute top-3 left-3 pointer-events-none text-gray-400 dark:text-gray-500 leading-relaxed font-sans select-none"
                >
                    {placeholder}
                </div>
            )}
            <div
                ref={elRef}
                id={id}
                role="textbox"
                aria-multiline="true"
                aria-labelledby={id ? `${id}-label` : undefined}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className={className}
                style={{ resize: 'vertical', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            />
        </div>
    );
});


const ImageCard = ({ id, label, imageSrc, isLoading, error, onRetry, onActivate, disabled, placeholder, selectedOption, onSelect, onHover }) => {
    const isSelected = selectedOption === id;
    const canSelect = !!imageSrc || id === 'cover';
    const handleClick = () => {
        if (disabled) return;
        if (canSelect) {
            onSelect(id);
        } else if (onActivate && !isLoading) {
            onActivate();
        }
    };
    const handleMouseEnter = () => {
        if (imageSrc && onHover) onHover({ id, src: imageSrc });
    };
    const handleMouseLeave = () => {
        if (onHover) onHover(null);
    };
    return (
        <div
            data-testid={`image-option-${id}`}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`relative aspect-square rounded-lg border-2 overflow-hidden flex flex-col cursor-pointer transition-all duration-200
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

const PostPage = ({ selectedTag }) => {
    const [articles, setArticles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(parseHashIndex);

    // AI proposals
    const [proposals, setProposals] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState(null);

    // Quote + metadata (editable)
    const [quote, setQuote] = useState('');
    const [author, setAuthor] = useState('');
    const [date, setDate] = useState('');
    const [domain, setDomain] = useState('');

    // Post content
    const [postContent, setPostContent] = useState('');
    const postTextareaRef = useRef(null);

    // Carousel state: 'proposals' | 'images'
    const [activePanel, setActivePanel] = useState('proposals');

    // Screenshot
    const [screenshotData, setScreenshotData] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureError, setCaptureError] = useState(null);

    // AI image
    const [aiImageData, setAiImageData] = useState(null);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [aiError, setAiError] = useState(null);

    // Custom image
    const [customImageData, setCustomImageData] = useState(null);
    const [isUploadingCustom, setIsUploadingCustom] = useState(false);
    const [customError, setCustomError] = useState(null);

    // Selected option for publish
    const [selectedImageOption, setSelectedImageOption] = useState('screenshot');

    // Hover preview: { id, src } of currently-hovered image card, or null
    const [hoveredImage, setHoveredImage] = useState(null);

    // Buffer channels with service types (fetched from server; localStorage may be stale)
    const [bufferChannels, setBufferChannels] = useState(() => loadSettings().bufferChannels || []);

    // Publishing state
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishResult, setPublishResult] = useState(null); // { type: 'success'|'error', message, url?, partialErrors?, tagWarning? }

    const abortRef = useRef(null);
    const lastLoadedIdRef = useRef(null);

    const extractDomain = (link) => {
        try { return new URL(link).hostname.replace(/^www\./, ''); }
        catch { return ''; }
    };

    const currentArticle = articles.length > 0 && currentIndex >= 0 && currentIndex < articles.length
        ? articles[currentIndex]
        : null;

    const loadArticles = useCallback(async () => {
        setIsLoading(true);
        try {
            const items = (await fetchTaggedItems(selectedTag)) || [];
            setArticles(items);
            setCurrentIndex(prev => {
                if (items.length === 0) return 0;
                return prev >= items.length ? 0 : prev;
            });
        } catch (error) {
            console.error('Failed to load articles', error);
            if (error.message === 'unauthorized') {
                window.location.href = '/setup?error=raindrop';
            }
        } finally {
            setIsLoading(false);
        }
    }, [selectedTag]);

    useEffect(() => {
        if (selectedTag) loadArticles();
    }, [selectedTag, loadArticles]);

    useEffect(() => {
        fetch('/api/system/status')
            .then(r => r.ok ? r.json() : null)
            .then(status => {
                if (status?.bufferChannels?.length) setBufferChannels(status.bufferChannels);
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        const next = `#${currentIndex + 1}`;
        if (window.location.hash !== next) {
            window.history.replaceState(null, '', next);
        }
    }, [currentIndex]);

    useEffect(() => {
        const onHashChange = () => setCurrentIndex(parseHashIndex());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const captureScreenshot = useCallback(async (article, signal, overrides = null) => {
        setIsCapturing(true);
        setCaptureError(null);
        try {
            const body = overrides || {
                url: article.link,
                quoteText: article.highlight || null,
                author: '',
                date: article.created ? new Date(article.created).toLocaleDateString() : '',
                domain: extractDomain(article.link),
                coverImageUrl: article.cover || null,
                articleHtml: null,
            };
            const response = await fetch('/api/screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal,
            });
            if (!response.ok) throw new Error('Failed to capture screenshot');
            const data = await response.json();
            if (signal?.aborted) return;
            if (data.imageData) setScreenshotData(data.imageData);
        } catch (err) {
            if (err?.name === 'AbortError') return;
            setCaptureError('Could not capture screenshot.');
        } finally {
            if (!signal?.aborted) setIsCapturing(false);
        }
    }, []);

    const refreshScreenshot = useCallback(() => {
        if (!currentArticle) return;
        captureScreenshot(currentArticle, abortRef.current?.signal, {
            url: currentArticle.link,
            quoteText: quote || null,
            author,
            date,
            domain,
            coverImageUrl: currentArticle.cover || null,
            articleHtml: null,
        });
    }, [currentArticle, quote, author, date, domain, captureScreenshot]);

    const triggerGeneration = useCallback(async (article, signal) => {
        if (!article) return;
        setIsGenerating(true);
        setGenerationError(null);
        setProposals([]);
        try {
            const settings = loadSettings();
            const customPrompt = settings.postingObjectives || 'Create engaging posts.';
            const results = await generateProposals(article, customPrompt, signal);
            if (signal?.aborted) return;
            setProposals(results.proposals || []);
            if (results.author) {
                setAuthor(prev => prev ? prev : results.author);
                // Re-capture screenshot now that we have the author name
                captureScreenshot(article, signal, {
                    url: article.link,
                    quoteText: article.highlight || null,
                    author: results.author,
                    date: article.created ? new Date(article.created).toLocaleDateString() : '',
                    domain: extractDomain(article.link),
                    coverImageUrl: article.cover || null,
                    articleHtml: null,
                });
            }
        } catch (error) {
            if (error?.name === 'AbortError') return;
            setGenerationError(error.message || 'Failed to generate proposals.');
        } finally {
            if (!signal?.aborted) setIsGenerating(false);
        }
    }, [captureScreenshot]);

    // Load new bookmark: cancel prior, reset state, fire fresh requests
    useEffect(() => {
        if (!currentArticle) return;
        if (lastLoadedIdRef.current === currentArticle._id) return;
        lastLoadedIdRef.current = currentArticle._id;

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        // Reset editable fields for new bookmark
        setPostContent('');
        setQuote(currentArticle.highlight || '');
        setAuthor(currentArticle.author || '');
        setDate(currentArticle.created ? new Date(currentArticle.created).toLocaleDateString() : '');
        setDomain(extractDomain(currentArticle.link));
        setScreenshotData(null);
        setCaptureError(null);
        setAiImageData(null);
        setAiError(null);
        setCustomImageData(null);
        setCustomError(null);
        setSelectedImageOption('screenshot');
        setActivePanel('proposals');
        setPublishResult(null);

        // Parallel: proposals + screenshot
        triggerGeneration(currentArticle, signal);
        captureScreenshot(currentArticle, signal);
    }, [currentArticle, triggerGeneration, captureScreenshot]);

    // Char limit warnings. We count only postContent + URL (no attribution or quote).
    const CHAR_LIMITS = { bluesky: 300, mastodon: 500, twitter: 280, threads: 500 };
    const SHORTENED_URL_LEN = 23;

    const computeFullText = (service = null) => {
        const hasLink = !!currentArticle?.link;
        if (!hasLink) return postContent;

        // Default to fixed 23-char cost (social standard).
        // Only override if a service is explicitly known NOT to shorten.
        const USE_FULL_URL_SERVICES = new Set([]);
        const linkPart = (service && USE_FULL_URL_SERVICES.has(service))
            ? currentArticle.link
            : 'x'.repeat(SHORTENED_URL_LEN);
        return `${postContent}\n\n${linkPart}`;
    };

    const bufferChannelObjects = bufferChannels.map(ch => typeof ch === 'string' ? { id: ch } : ch);
    const bufferChannelIds = bufferChannelObjects.map(ch => ch.id);
    const charWarnings = bufferChannelObjects
        .filter(ch => {
            const limit = CHAR_LIMITS[ch.service];
            if (!limit) return false;
            return computeFullText(ch.service).length > limit;
        })
        .map(ch => ({ service: ch.service, limit: CHAR_LIMITS[ch.service] }))
        .filter((w, i, arr) => arr.findIndex(x => x.service === w.service) === i);

    const isAnyLoading = isCapturing || isGeneratingAi || isUploadingCustom;

    // Maximum postContent length permitted by the strictest channel.
    // Chars beyond this index should be highlighted as over-limit.
    // Always applies: uses strictest known limit as a floor even when no channels have a known service
    // (or no channels are configured), so the user gets feedback regardless of Buffer setup state.
    const maxAllowedPostLen = (() => {
        let min = Infinity;
        for (const ch of bufferChannelObjects) {
            const limit = CHAR_LIMITS[ch.service];
            if (!limit) continue;
            const fullTextLen = computeFullText(ch.service).length;
            const offset = fullTextLen - postContent.length;
            const allowed = Math.max(0, limit - offset);
            if (allowed < min) min = allowed;
        }
        if (!Number.isFinite(min)) {
            // No known-service channels: applying strictest known limit conservatively
            const strictest = Math.min(...Object.values(CHAR_LIMITS));
            // Default to non-Bluesky (full URL) offset for safety
            const offset = computeFullText().length - postContent.length;
            return Math.max(0, strictest - offset);
        }
        return min;
    })();
    const hasOverage = maxAllowedPostLen !== null && postContent.length > maxAllowedPostLen;
    const hasCharLimitViolation = charWarnings.length > 0 || hasOverage;

    const insertEmoji = (emoji) => {
        const editor = postTextareaRef.current;
        const el = editor?.element?.();
        if (editor && el && document.activeElement === el) {
            const offset = editor.getCursorOffset();
            const next = postContent.slice(0, offset) + emoji + postContent.slice(offset);
            setPostContent(next);
            requestAnimationFrame(() => {
                editor.focus();
                editor.setCursorOffset(offset + emoji.length);
            });
        } else {
            setPostContent(prev => prev + emoji);
        }
    };

    const handleNewer = () => setCurrentIndex(i => Math.max(0, i - 1));
    const handleOlder = () => setCurrentIndex(i => Math.min(articles.length - 1, i + 1));
    const handleRegenerate = () => {
        if (!currentArticle) return;
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setActivePanel('proposals');
        triggerGeneration(currentArticle, abortRef.current.signal);
    };

    const generateAiImage = async () => {
        setIsGeneratingAi(true);
        setAiError(null);
        try {
            const response = await fetch('/api/venice/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: `Roy Lichtenstein pop art style comic book panel featuring a large speech bubble with the text: '${quote || currentArticle?.title || ''}' Style elements: Bold black outlines, Ben-Day dot patterns for shading, vibrant primary colors (red, blue, yellow), clean graphic composition. Speech bubble has thick black borders and classic comic book font. Background is solid red with subtle halftone dot texture. No gradients or soft shading. High-contrast, flat colors. Comic book aesthetic with precise geometric shapes.`,
                }),
                signal: abortRef.current?.signal,
            });
            if (!response.ok) throw new Error('Failed to generate AI image');
            const data = await response.json();
            setAiImageData(data.imageData);
            setSelectedImageOption('ai');
        } catch (err) {
            if (err?.name === 'AbortError') return;
            setAiError('Could not generate AI image.');
        } finally {
            setIsGeneratingAi(false);
        }
    };

    const handleImageUpload = async (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        setIsUploadingCustom(true);
        setCustomError(null);
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });
            const resized = await resizeImage(base64);
            setCustomImageData(resized);
            setSelectedImageOption('custom');
        } catch (error) {
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

    const handlePaste = useCallback((e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleImageUpload(file);
                break;
            }
        }
    }, []);

    useEffect(() => {
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handlePaste]);

    const handleSelectProposal = (text) => {
        setPostContent(text);
        setActivePanel('images');
    };

    const handlePostChange = (value) => {
        setPostContent(value);
        if (activePanel === 'proposals') setActivePanel('images');
    };

    const getSelectedImage = () => {
        switch (selectedImageOption) {
            case 'cover': return { imageData: null, coverUrl: currentArticle?.cover || null };
            case 'screenshot': return { imageData: screenshotData, coverUrl: null };
            case 'ai': return { imageData: aiImageData, coverUrl: null };
            case 'custom': return { imageData: customImageData, coverUrl: null };
            default: return { imageData: null, coverUrl: null };
        }
    };

    const handlePublish = async (bufferMode) => {
        if (!currentArticle) return;
        setIsPublishing(true);
        try {
            const { imageData, coverUrl } = getSelectedImage();

            // All posts strictly use [Post Text]\n\n[URL]. 
            // Attribution/Quote is only visual in the screenshot image.
            const fullText = currentArticle.link ? `${postContent}\n\n${currentArticle.link}` : postContent;

            const result = await publishPost(fullText, currentArticle.link, { imageData, coverUrl }, 'buffer', bufferChannelIds, bufferMode);

            let tagWarning = null;
            const settings = loadSettings();
            const tag = settings.selectedTag;
            if (tag && currentArticle._id && currentArticle.tags) {
                const newTags = currentArticle.tags
                    .filter(t => t !== tag)
                    .concat(`${tag}_posted`);
                const ok = await updateBookmarkTags(currentArticle._id, newTags);
                if (!ok) tagWarning = 'Could not update tags in Raindrop.io.';
            }

            setPublishResult({
                type: 'success',
                message: 'Post published!',
                url: result.url,
                partialErrors: result.partialErrors,
                tagWarning,
            });
        } catch (error) {
            setPublishResult({
                type: 'error',
                message: error.message || 'Failed to publish post.',
            });
        } finally {
            setIsPublishing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-8 animate-fade-in w-full">
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                    <div className="flex justify-center items-center py-12">
                        <p className="text-gray-500 dark:text-gray-400">Loading articles...</p>
                    </div>
                </section>
            </div>
        );
    }

    if (articles.length === 0) {
        return (
            <div className="space-y-8 animate-fade-in w-full">
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Empty Queue</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">No articles found for tag "{selectedTag}".</p>
                        <button
                            onClick={loadArticles}
                            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                        >
                            Reload Raindrops
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    const nav = (
        <BookmarkNav
            currentIndex={currentIndex}
            totalCount={articles.length}
            onNewer={handleNewer}
            onOlder={handleOlder}
            onRegenerate={handleRegenerate}
            regenerateDisabled={isGenerating}
        />
    );

    return (
        <div className="space-y-8 animate-fade-in w-full">
            <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm p-6 sm:p-8 transition-colors duration-300">
                {nav}

                <div className="border-y border-gray-200 dark:border-gray-800 py-4 my-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mb-2">
                        {currentArticle.title}
                    </h2>
                    <a
                        href={currentArticle.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                        {currentArticle.link}
                    </a>
                    <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        ({currentArticle.link.length})
                    </span>
                </div>

                {/* Post content + emoji buttons + publish buttons — the primary workflow */}
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 border border-amber-200 dark:border-amber-800/50 mb-6">
                    <label id="post-editor-label" htmlFor="post-editor" className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Post
                    </label>
                    <div className="flex gap-3 items-start">
                        <HighlightedPostEditor
                            ref={postTextareaRef}
                            id="post-editor"
                            value={postContent}
                            onChange={handlePostChange}
                            maxAllowedLen={maxAllowedPostLen}
                            placeholder="Write your post..."
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-3 min-h-[100px] text-gray-800 dark:text-gray-200 leading-relaxed font-sans outline-none"
                        />
                        <div className="flex flex-col gap-2">
                            {['🔥', '🤯', '🤡'].map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => insertEmoji(emoji)}
                                    className="text-base px-1.5 py-0.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    aria-label={emoji}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        {postContent.length} characters
                    </div>
                    {charWarnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {charWarnings.map(w => (
                                <p key={w.service} className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                    Exceeds {w.service.charAt(0).toUpperCase() + w.service.slice(1)}'s {w.limit}-character limit
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Publish buttons — inside the amber Post box to visually unify the workflow */}
                    <div className="mt-4 pt-4 border-t border-amber-200 dark:border-amber-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-end gap-3">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Save to Buffer:</span>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => handlePublish('now')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation || !postContent.trim()}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white shadow-sm bg-red-600 hover:bg-red-700 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                Now
                            </button>
                            <button
                                onClick={() => handlePublish('prioritize')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation || !postContent.trim()}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-transparent text-sm font-medium text-white shadow-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                Prioritize
                            </button>
                            <button
                                onClick={() => handlePublish('next')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation || !postContent.trim()}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                Next Available
                            </button>
                            <button
                                onClick={() => handlePublish('draft')}
                                disabled={isPublishing || isAnyLoading || hasCharLimitViolation || !postContent.trim()}
                                className="inline-flex items-center justify-center rounded-md px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                Drafts
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quote + metadata */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700 mb-6">
                    <label htmlFor="quote-editor" className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-2">
                        Quote
                    </label>
                    <textarea
                        id="quote-editor"
                        value={quote}
                        onChange={(e) => setQuote(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-3 resize-y min-h-[80px] text-gray-800 dark:text-gray-200 leading-relaxed font-sans placeholder-gray-400 dark:placeholder-gray-500 mb-4"
                        placeholder="Quote text..."
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="author-input" className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-1">Author</label>
                            <input id="author-input" type="text" value={author} onChange={e => setAuthor(e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2 text-sm text-gray-800 dark:text-gray-200" placeholder="Author name" />
                        </div>
                        <div>
                            <label htmlFor="date-input" className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-1">Date</label>
                            <input id="date-input" type="text" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2 text-sm text-gray-800 dark:text-gray-200" placeholder="Publication date" />
                        </div>
                        <div>
                            <label htmlFor="domain-input" className="block text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-400 uppercase mb-1">Publication</label>
                            <div className="flex items-end gap-2">
                                <input id="domain-input" type="text" value={domain} onChange={e => setDomain(e.target.value)} className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-md p-2 text-sm text-gray-800 dark:text-gray-200" placeholder="Domain name" />
                                <button
                                    type="button"
                                    onClick={refreshScreenshot}
                                    disabled={isCapturing}
                                    aria-label="Refresh screenshot"
                                    title="Refresh screenshot"
                                    className="shrink-0 inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed p-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isCapturing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582M20 20v-5h-.581M5.635 18.364A9 9 0 0019.418 15M18.364 5.636A9 9 0 004.582 9" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Carousel: AI Proposals or Image Options */}
                <div className="mb-6 min-h-[520px]">
                    {activePanel === 'proposals' && (
                        <div data-testid="ai-proposals-panel">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">AI Proposals</h3>
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
                                    <p className="text-red-700 dark:text-red-400 font-medium mb-4">{generationError}</p>
                                    <button
                                        onClick={handleRegenerate}
                                        className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900 rounded-md text-sm font-medium transition-colors"
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : proposals.length > 0 ? (
                                <div className="space-y-4">
                                    {proposals.map((proposal, idx) => (
                                        <div key={idx} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm relative">
                                            <div className="absolute top-3 left-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                                                {idx + 1}
                                            </div>
                                            <p className="text-gray-800 dark:text-gray-200 pl-8 whitespace-pre-wrap leading-relaxed">{proposal}</p>
                                            <div className="mt-4 pl-8 flex justify-between items-center">
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{proposal.length} characters</span>
                                                <button
                                                    onClick={() => handleSelectProposal(proposal)}
                                                    aria-label="Select this proposal"
                                                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                                                >
                                                    Select
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No proposals available.</p>
                            )}
                        </div>
                    )}

                    {activePanel === 'images' && (
                        <div
                            data-testid="image-options-panel"
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Image Options</h3>
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
                                    imageSrc={currentArticle.cover || null}
                                    isLoading={false}
                                    error={null}
                                    disabled={!currentArticle.cover}
                                    placeholder="No cover available"
                                    selectedOption={selectedImageOption}
                                    onSelect={setSelectedImageOption}
                                    onHover={setHoveredImage}
                                />
                                <ImageCard
                                    id="screenshot"
                                    label="Screenshot"
                                    imageSrc={screenshotData}
                                    isLoading={isCapturing}
                                    error={captureError}
                                    onRetry={() => captureScreenshot(currentArticle, abortRef.current?.signal)}
                                    selectedOption={selectedImageOption}
                                    onSelect={setSelectedImageOption}
                                    onHover={setHoveredImage}
                                />
                                <ImageCard
                                    id="ai"
                                    label="AI Generated"
                                    imageSrc={aiImageData}
                                    isLoading={isGeneratingAi}
                                    error={aiError}
                                    onRetry={generateAiImage}
                                    onActivate={generateAiImage}
                                    placeholder="Click to generate"
                                    selectedOption={selectedImageOption}
                                    onSelect={setSelectedImageOption}
                                    onHover={setHoveredImage}
                                />
                                <ImageCard
                                    id="custom"
                                    label="Custom"
                                    imageSrc={customImageData}
                                    isLoading={isUploadingCustom}
                                    error={customError}
                                    placeholder="Paste or upload"
                                    selectedOption={selectedImageOption}
                                    onSelect={setSelectedImageOption}
                                    onHover={setHoveredImage}
                                />
                            </div>
                            {hoveredImage && (
                                <div
                                    data-testid="image-preview-overlay"
                                    className="fixed inset-0 flex items-center justify-center z-40 pointer-events-none"
                                >
                                    <div className="bg-black/70 rounded-xl p-4 max-w-[80vw] max-h-[80vh] flex items-center justify-center">
                                        <img
                                            src={hoveredImage.src}
                                            alt="Preview"
                                            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {nav}
            </section>

            {publishResult && (
                <PublishOverlay
                    type={publishResult.type}
                    message={publishResult.message}
                    url={publishResult.url}
                    partialErrors={publishResult.partialErrors}
                    tagWarning={publishResult.tagWarning}
                    onDismiss={() => {
                        const wasSuccess = publishResult.type === 'success';
                        setPublishResult(null);
                        if (wasSuccess) loadArticles();
                    }}
                />
            )}
        </div>
    );
};

export default PostPage;
