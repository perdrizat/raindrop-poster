import { getBrowser } from './scraperService.js';

/**
 * Captures a square screenshot of a quote within an article.
 * Highlights the quote with a yellow marker and adds an attribution bar.
 *
 * @param {string} articleUrl - The article URL to screenshot
 * @param {string|null} quoteText - The quote text to find and highlight
 * @param {object} attribution - { author, date, domain }
 * @param {string|null} coverImageUrl - Fallback cover image URL from Raindrop
 * @returns {Promise<Buffer|string>} PNG buffer, or a cover URL string if no quote and cover exists
 */
export const captureQuoteScreenshot = async (articleUrl, quoteText, attribution, coverImageUrl = null) => {
    // Shortcut: no quote text and cover image available → use cover directly
    if (!quoteText && coverImageUrl) {
        return coverImageUrl;
    }

    let page;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await page.setViewport({
            width: 390,
            height: 8000,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 2,
        });

        // removed forced mobile UserAgent

        let targetUrl = articleUrl;
        const twitterRegex = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)/i;
        const match = articleUrl.match(twitterRegex);
        if (match) {
            targetUrl = `https://vxtwitter.com/${match[1]}/status/${match[2]}`;
        }

        // SSRN is extremely strict with Cloudflare bot protection. Route to Wayback Machine
        if (articleUrl.includes('ssrn.com')) {
            try {
                const parsedUrl = new URL(articleUrl);
                const abstractId = parsedUrl.searchParams.get('abstract_id');
                // Strip tracking params because Wayback Machine only archives the base URL
                const cleanUrl = `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${abstractId}`;
                targetUrl = `https://web.archive.org/web/2/${cleanUrl}`;
            } catch (err) {
                targetUrl = `https://web.archive.org/web/2/${articleUrl}`;
            }
        }



        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().includes('wombat.js') || req.url().includes('banner.js')) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for potential Cloudflare challenge
        if (process.env.NODE_ENV !== 'test') {
            await new Promise(resolve => setTimeout(resolve, 8000));
        }

        if (match) {
            // Wait for redirect to X.com to finish safely
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => { });

            await page.evaluate(() => {
                const hideFixedDivs = () => {
                    const fixedElements = document.querySelectorAll('div[style*="position: fixed"], div[style*="position: absolute"]');
                    fixedElements.forEach(el => {
                        const text = el.innerText.toLowerCase();
                        if (text.includes('cookies') || text.includes('open app') || text.includes('not now') || text.includes('log in') || text.includes('sign up')) {
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                            el.style.opacity = '0';
                        }
                    });
                    const layers = document.getElementById('layers');
                    if (layers) layers.style.display = 'none';
                };

                hideFixedDivs();
                setTimeout(hideFixedDivs, 1000);
                setTimeout(hideFixedDivs, 2000);

                const expandTweet = () => {
                    const spans = Array.from(document.querySelectorAll('span'));
                    const showMore = spans.find(s => s.innerText === 'Show more');
                    if (showMore) showMore.click();
                };
                expandTweet();
                setTimeout(expandTweet, 1000);
            });
            // Allow animations to finish after clicking "Show more"
            if (process.env.NODE_ENV !== 'test') {
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Step 1: Find and highlight the quote
        const findResult = await page.evaluate(async (quote) => {
            try {
                if (!quote) return { found: false, rect: null };

                const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”«»]/g, '"');
                const normalizedQuote = normalize(quote);

                // Include all alphanumeric words, even short ones, for sequential matching
                const regex = /[a-z0-9]+/g;
                let match;
                const quoteWords = [];
                while ((match = regex.exec(normalizedQuote)) !== null) {
                    quoteWords.push(match[0]);
                }

                if (quoteWords.length === 0) return { found: false, rect: null };

                // Collect all text nodes
                const rootNode = document.querySelector('[data-testid="tweetText"]') || document.querySelector('article') || document.body;
                const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
                    acceptNode: function (node) {
                        const parent = node.parentNode;
                        if (!parent) return NodeFilter.FILTER_REJECT;
                        if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }, false);

                const globalTokens = [];
                let node;
                while (node = walker.nextNode()) {
                    const rawText = node.nodeValue;
                    let m;
                    const nodeRegex = /[a-z0-9]+/ig;
                    while ((m = nodeRegex.exec(rawText)) !== null) {
                        globalTokens.push({
                            word: m[0].toLowerCase(),
                            node: node,
                            index: m.index,
                            length: m[0].length
                        });
                    }
                }

                let maxScore = 0;
                let bestStart = 0;
                let bestEnd = 0;

                // Better algorithm: For each token in the document that matches the first word of the quote
                // check how many subsequent words match in order with some allowed gaps.
                for (let i = 0; i < globalTokens.length; i++) {
                    // Find a decent starting word (could be the first few words of the quote)
                    const firstQuoteWord = quoteWords[0];
                    const secondQuoteWord = quoteWords.length > 1 ? quoteWords[1] : null;

                    if (globalTokens[i].word !== firstQuoteWord && globalTokens[i].word !== secondQuoteWord) continue;

                    let quoteIdx = 0;
                    let matchCount = 0;
                    let currentEnd = i;
                    let misses = 0;

                    for (let j = i; j < Math.min(globalTokens.length, i + quoteWords.length + 20); j++) {
                        if (quoteIdx >= quoteWords.length) break;

                        if (globalTokens[j].word === quoteWords[quoteIdx]) {
                            matchCount++;
                            quoteIdx++;
                            currentEnd = j;
                            misses = 0;
                        } else if (globalTokens[j].word === quoteWords[quoteIdx + 1]) {
                            // skipped one word in the quote
                            matchCount++;
                            quoteIdx += 2;
                            currentEnd = j;
                            misses = 0;
                        } else {
                            misses++;
                            if (misses > 10) break; // too many consecutive misses between matches
                        }
                    }

                    // Score is heavily weighted by sequential matches
                    const score = matchCount;

                    if (score > maxScore) {
                        maxScore = score;
                        bestStart = i;
                        bestEnd = currentEnd;
                    }
                }

                // If we found a reasonable match (e.g. at least 30% of the quote words)
                if (maxScore > quoteWords.length * 0.3) {
                    const startToken = globalTokens[bestStart];
                    const endToken = globalTokens[bestEnd];

                    const startNode = startToken.node;
                    const endNode = endToken.node;

                    const range = document.createRange();
                    range.setStart(startNode, startToken.index);
                    range.setEnd(endNode, endToken.index + endToken.length);

                    if (startNode.parentElement) {
                        startNode.parentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
                    }

                    await new Promise(resolve => setTimeout(resolve, 600));

                    let rects = [];
                    const clientRectsList = range.getClientRects();
                    for (let i = 0; i < clientRectsList.length; i++) {
                        rects.push(clientRectsList[i]);
                    }

                    if (rects.length === 0) {
                        console.log("Range API failed, falling back to mark tags");
                        const nodesToWrap = new Set();
                        for (let k = bestStart; k <= bestEnd; k++) {
                            nodesToWrap.add(globalTokens[k].node);
                        }

                        nodesToWrap.forEach(n => {
                            const mark = document.createElement('mark');
                            mark.style.backgroundColor = '#FFEB3B';
                            mark.style.color = 'black';
                            if (n.parentNode) {
                                n.parentNode.replaceChild(mark, n);
                                mark.appendChild(n);
                            }
                            const r = mark.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) {
                                rects.push(r);
                            }
                        });
                    } else {
                        const style = document.createElement('style');
                        style.textContent = `
                            ::selection {
                                background-color: #FFEB3B !important;
                                color: black !important;
                            }
                        `;
                        document.head.appendChild(style);

                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }

                    if (rects.length === 0) {
                        console.log("No rects found even after fallback");
                        return { found: false, rect: null };
                    }

                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for (const r of rects) {
                        if (r.width === 0 || r.height === 0) continue;
                        if (r.x < minX) minX = r.x;
                        if (r.y < minY) minY = r.y;
                        if (r.x + r.width > maxX) maxX = r.x + r.width;
                        if (r.y + r.height > maxY) maxY = r.y + r.height;
                    }



                    return { found: true, rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, debugInfo: { maxScore, bestStart, bestEnd, startWord: startToken.word, endWord: endToken.word, quoteLength: quoteWords.length } };
                }



                return { found: false, rect: null };
            } catch (e) {
                return { found: false, rect: null, debugError: e.stack };
            }
        }, quoteText);

        if (findResult.debugError) {
        }

        // Step 2: Compute square padded clip region
        const clip = await page.evaluate((foundResult) => {
            const viewportWidth = window.innerWidth;
            const pageHeight = document.documentElement.scrollHeight;

            if (foundResult.found && foundResult.rect) {
                const padding = 15;
                const barHeight = 40;

                const rawWidth = foundResult.rect.width + (padding * 2);
                const sideSize = Math.min(rawWidth, viewportWidth);

                let x = foundResult.rect.x - padding;
                if (x < 0) x = 0;
                if (x + sideSize > viewportWidth) x = viewportWidth - sideSize;

                const size = sideSize;

                const highlightCenterY = foundResult.rect.y + window.scrollY + (foundResult.rect.height / 2);
                let y = highlightCenterY - (size / 2);



                if (y < 0) y = 0;

                const totalHeight = size + barHeight;
                if (y + totalHeight > pageHeight) y = pageHeight - totalHeight;

                return { x, y, size, totalHeight, barHeight };
            } else {
                // Fallback: If we couldn't find the text, try to clip to the article element
                const article = document.querySelector('article[data-testid="tweet"]');
                if (article) {
                    const r = article.getBoundingClientRect();
                    const barHeight = 40;
                    let x = r.x;
                    let y = r.y + window.scrollY;
                    let size = Math.min(r.width, viewportWidth);

                    // Keep it square if possible
                    if (size < r.height) {
                        size = Math.min(r.height, viewportWidth);
                    }

                    if (x < 0) x = 0;
                    if (y < 0) y = 0;
                    if (x + size > viewportWidth) x = viewportWidth - size;

                    const totalHeight = size + barHeight;
                    return { x, y, size, totalHeight, barHeight };
                }

                // Ultimate Fallback: full viewport width square-ish
                const size = Math.min(viewportWidth, 700);
                return { x: 0, y: 0, size, totalHeight: size + 40, barHeight: 40 };
            }
        }, findResult);

        // Step 3: Inject attribution bar at the bottom of the clip
        const attrText = formatAttribution(attribution);
        await page.evaluate((text, clipBox) => {
            const bar = document.createElement('div');
            bar.id = 'raindrop-attribution';
            bar.textContent = text;

            Object.assign(bar.style, {
                position: 'absolute',
                top: `${clipBox.y + clipBox.size}px`,
                left: `${clipBox.x}px`,
                width: `${clipBox.size}px`,
                height: `${clipBox.barHeight}px`,
                background: '#222222',
                color: '#ffffff',
                padding: '0 16px',
                lineHeight: `${clipBox.barHeight}px`,
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                zIndex: '99999',
                letterSpacing: '0.3px',
                boxSizing: 'border-box'
            });
            document.body.appendChild(bar);
        }, attrText, clip);

        // Step 4: Take the screenshot


        const screenshotBuffer = await page.screenshot({
            type: 'png',
            clip: {
                x: clip.x,
                y: clip.y,
                width: clip.size,
                height: clip.totalHeight
            }
        });
        return screenshotBuffer;
    } catch (error) {
        console.error('Screenshot error:', error.stack);
        throw new Error('Failed to capture screenshot');
    } finally {
        if (page) {
            await page.close().catch(() => { });
        }
    }
};

/**
 * Formats the attribution bar text.
 * e.g. "✍ Jane Smith · Feb 2026 · wired.com"
 */
function formatAttribution({ author, date, domain }) {
    const parts = ['✍'];

    if (author) parts.push(author);

    if (date) {
        try {
            const d = new Date(date);
            const month = d.toLocaleString('en', { month: 'short' });
            const year = d.getFullYear();
            parts.push(`${month} ${year}`);
        } catch {
            // skip date
        }
    }

    if (domain) parts.push(domain);

    return parts.join(' · ');
}

export { formatAttribution };
