import { getBrowser } from './scraperService.js';
import { findQuoteInDOM } from './highlighter.js';

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
            const reqUrl = req.url();
            try {
                const host = new URL(reqUrl).hostname;
                if (host === 'papers.ssrn.com' || host === 'ssrn.com') {
                    // Prevent escaping the web archive to the live Cloudflare site
                    req.abort();
                    return;
                }
            } catch (e) { }

            if (reqUrl.includes('wombat.js') || reqUrl.includes('banner.js')) {
                // Wombat overrides Function.apply and causes Maximum call stack size exceeded during page.evaluate
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        if (process.env.NODE_ENV !== 'test') {
            await new Promise(resolve => setTimeout(resolve, 8000));
        }

        // Step 1: Find and highlight the quote
        const findResult = await page.evaluate(findQuoteInDOM, quoteText);

        if (process.env.DEBUG_HIGHLIGHT === 'true') {
            console.log("findResult:", findResult);
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
