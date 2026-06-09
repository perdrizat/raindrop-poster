import { acquireBrowser, releaseBrowser } from './scraperService.js';
import { findQuoteInDOM } from './highlighter.js';

/**
 * Wraps article HTML in a styled shell for local rendering.
 */
function wrapArticleHtml(articleHtml) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 18px; line-height: 1.7; color: #1a1a1a; background: #fff;
    padding: 24px 20px; max-width: 390px;
  }
  h1, h2, h3, h4, h5, h6 { margin: 1em 0 0.5em; line-height: 1.3; }
  h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
  p { margin: 0.8em 0; }
  img { max-width: 100%; height: auto; display: block; margin: 1em 0; }
  blockquote { border-left: 3px solid #ccc; padding-left: 16px; margin: 1em 0; color: #555; }
  a { color: #1a73e8; text-decoration: none; }
  pre, code { font-family: monospace; font-size: 0.9em; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
  pre { padding: 12px; overflow-x: auto; margin: 1em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.8em 0; }
  figure { margin: 1em 0; }
  figcaption { font-size: 0.85em; color: #666; margin-top: 0.5em; }
</style></head><body>${articleHtml}</body></html>`;
}

/**
 * Captures a square screenshot of a quote within an article.
 * Highlights the quote with a yellow marker and adds an attribution bar.
 *
 * When articleHtml is provided, renders it locally via page.setContent() —
 * no external page load, no popup dismissal, no archive fallbacks needed.
 * Falls back to loading the live URL when articleHtml is null.
 *
 * @param {string|null} articleHtml - Pre-scraped article HTML (from Readability), or null to load live URL
 * @param {string} articleUrl - The article URL (used for live-URL fallback and URL rewriting)
 * @param {string|null} quoteText - The quote text to find and highlight
 * @param {object} attribution - { author, date, domain }
 * @param {string|null} coverImageUrl - Fallback cover image URL from Raindrop
 * @returns {Promise<Buffer|string>} PNG buffer, or a cover URL string if no quote and cover exists
 */
export const captureQuoteScreenshot = async (articleHtml, articleUrl, quoteText, attribution, coverImageUrl = null) => {
    // Shortcut: no quote text and cover image available → use cover directly
    if (!quoteText && coverImageUrl) {
        return coverImageUrl;
    }

    const browser = await acquireBrowser();
    let page;
    try {
        page = await browser.newPage();

        await page.setViewport({
            width: 390,
            height: 8000,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 2,
        });

        let findResult;

        if (articleHtml) {
            // ── Local HTML path: render pre-scraped content, no network needed ──
            // Strip lazy-loading so images load immediately; without this, lazy
            // images load after we measure scrollHeight, causing a 2000-3000px
            // layout shift that misplaces the screenshot clip.
            const styledHtml = wrapArticleHtml(
                articleHtml.replace(/\sloading=["']lazy["']/gi, '')
            );
            // networkidle0 waits for all images to finish loading so the layout
            // is stable before we measure scrollHeight.
            await page.setContent(styledHtml, { waitUntil: 'networkidle0', timeout: 30000 })
                .catch(() => page.setContent(styledHtml, { waitUntil: 'load' }));

            // Expand the viewport to the fully-loaded document height so that
            // findQuoteInDOM measurements are taken against the stable final layout.
            // Using a very large initial viewport (50000px) and then clamping avoids
            // a second reflow caused by expanding the viewport after layout is done.
            const initialScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            const stableHeight = Math.max(initialScrollHeight, 8000);
            await page.setViewport({
                width: 390,
                height: stableHeight,
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 2,
            });

            findResult = await page.evaluate(findQuoteInDOM, quoteText);

            if (process.env.DEBUG_HIGHLIGHT === 'true') {
                console.log("findResult (local HTML):", findResult);
            }

            if (!findResult.found) {
                console.warn('[screenshot] Quote not found in local HTML — falling back to live URL');
            }
        }

        if (!articleHtml || !findResult.found) {
            // ── Live URL path: load the page, dismiss popups, try archive fallbacks ──

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
                    const cleanUrl = `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${abstractId}`;
                    targetUrl = `https://web.archive.org/web/2/${cleanUrl}`;
                } catch (err) {
                    targetUrl = `https://web.archive.org/web/2/${articleUrl}`;
                }
            }

            // Auto-accept Usercentrics consent
            await page.evaluateOnNewDocument(() => {
                let _UC_UI, _ucCmp;
                const autoAccept = (api) => {
                    const run = () => { try { api.acceptAllConsents(); } catch (e) {} };
                    setTimeout(run, 50);
                    setTimeout(run, 500);
                    setTimeout(run, 1500);
                };
                try {
                    Object.defineProperty(window, 'UC_UI', {
                        configurable: true,
                        get: () => _UC_UI,
                        set: (val) => { _UC_UI = val; autoAccept(val); }
                    });
                    Object.defineProperty(window, '__ucCmp', {
                        configurable: true,
                        get: () => _ucCmp,
                        set: (val) => { _ucCmp = val; autoAccept(val); }
                    });
                } catch (e) {}

                try {
                    const obs = new MutationObserver(() => {
                        for (const el of document.querySelectorAll('*')) {
                            if (!el.shadowRoot) continue;
                            const btn = el.shadowRoot.querySelector(
                                '.uc-accept-button, button[data-action-type="accept"]'
                            );
                            if (btn) { btn.click(); obs.disconnect(); return; }
                        }
                    });
                    obs.observe(document.documentElement, { childList: true, subtree: true });
                } catch (e) {}
            });

            await page.setRequestInterception(true);
            page.on('request', req => {
                const reqUrl = req.url();
                try {
                    const host = new URL(reqUrl).hostname;
                    if (host === 'papers.ssrn.com' || host === 'ssrn.com') {
                        req.abort();
                        return;
                    }
                } catch (e) { }

                if (reqUrl.includes('wombat.js') || reqUrl.includes('banner.js')) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 })
                .catch(e => { if (!e.message.includes('timeout')) throw e; });

            if (process.env.NODE_ENV !== 'test') {
                await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
                await new Promise(resolve => setTimeout(resolve, 2000));
                await dismissPopups(page);
                await new Promise(resolve => setTimeout(resolve, 6000));
                await dismissPopups(page);
                await page.setViewport({ width: 390, height: 8000, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            findResult = await page.evaluate(findQuoteInDOM, quoteText);

            if (process.env.DEBUG_HIGHLIGHT === 'true') {
                console.log("findResult:", findResult);
            }

            // Archive fallback chain
            const isAlreadyArchive = targetUrl.includes('web.archive.org')
                || targetUrl.includes('archive.ph')
                || targetUrl.includes('vxtwitter.com')
                || targetUrl.includes('freedium.cfd');

            if (!findResult.found && !isAlreadyArchive) {
                const archiveFallbacks = [
                    ...(/medium\.com\//.test(articleUrl)
                        ? [{ name: 'freedium.cfd', url: `https://freedium.cfd/${articleUrl}` }]
                        : []),
                    { name: 'archive.ph',      url: `https://archive.ph/newest/${articleUrl}` },
                    { name: 'Wayback Machine', url: `https://web.archive.org/web/2/${articleUrl}` },
                ];

                for (const fallback of archiveFallbacks) {
                    if (findResult.found) break;
                    try {
                        console.warn(`[screenshot] Quote not found — retrying via ${fallback.name}`);
                        await page.goto(fallback.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                        if (process.env.NODE_ENV !== 'test') {
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            await dismissPopups(page);
                            await hideArchiveToolbars(page);
                        }
                        findResult = await page.evaluate(findQuoteInDOM, quoteText);
                        if (process.env.DEBUG_HIGHLIGHT === 'true') {
                            console.log(`findResult (${fallback.name}):`, findResult);
                        }
                    } catch (e) {
                        console.warn(`[screenshot] ${fallback.name} fallback failed: ${e.message}`);
                    }
                }
            }
        }

        // Step 2: Compute square padded clip region in Node (pure function, no browser context needed)
        const viewportWidth = 390;
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const clip = computeClip(findResult, viewportWidth, pageHeight);

        // Step 3: Inject attribution bar at the bottom of the clip
        const attrText = formatAttribution(attribution);
        await page.evaluate((text, clipBox) => {
            const bar = document.createElement('div');
            bar.id = 'raindrop-attribution';
            bar.textContent = text;

            Object.assign(bar.style, {
                position: 'absolute',
                top: `${clipBox.y + (clipBox.height || clipBox.size)}px`,
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

        // Step 4: Ensure the viewport is tall enough to encompass the clip region.
        // Puppeteer's clip-based screenshot only renders content within the current
        // viewport height. For long articles (scrollHeight >> 8000px), the quote may
        // sit below the current viewport boundary, producing a blank/wrong capture.
        // Resizing to clip.y + clip.totalHeight forces the browser to lay out that region.
        const requiredHeight = Math.ceil(clip.y + clip.totalHeight);
        if (requiredHeight > 8000) {
            await page.setViewport({
                width: 390,
                height: requiredHeight,
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 2,
            });
        }

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
        if (page) await page.close().catch(() => {});
        releaseBrowser(browser);
    }
};

/**
 * Attempts to dismiss cookie banners, consent dialogs, and popups before screenshotting.
 * Best-effort: errors are swallowed so they never block the screenshot.
 */
async function dismissPopups(page) {
    try {
        // Pass 1: click known dismiss/accept buttons
        await page.evaluate(() => {
            const knownSelectors = [
                // OneTrust
                '#onetrust-accept-btn-handler',
                '#onetrust-reject-all-handler',
                '.onetrust-close-btn-handler',
                // Cookiebot
                '#CybotCookiebotDialogBodyButtonAccept',
                '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
                // Cookie Consent (Insites)
                '.cc-accept', '.cc-dismiss', '.cc-btn.cc-accept',
                // Quantcast
                '.qc-cmp2-summary-buttons button',
                // WP GDPR plugin
                '#gdpr-cookie-consent-accept-button',
                // Generic
                '[data-testid="cookie-accept"]',
                '[data-testid="GDPR-accept"]',
                '[aria-label="Accept cookies"]',
                '[aria-label="accept cookies"]',
                '[aria-label="Close"]',
                '#cookie-accept', '#accept-cookies',
                '.cookie-accept', '.accept-cookies',
                '#dismiss-button',
                '#sp-cc-accept',
            ];

            for (const sel of knownSelectors) {
                const el = document.querySelector(sel);
                if (el && el.offsetParent !== null) { el.click(); return; }
            }

            // Text-match common button labels
            const acceptPatterns = [
                /^accept all(\s+cookies)?$/i,
                /^accept(\s+&\s+close)?$/i,
                /^agree$/i,
                /^i agree$/i,
                /^ok(,?\s*i agree)?$/i,
                /^got it$/i,
                /^allow all(\s+cookies)?$/i,
                /^allow cookies$/i,
                /^continue$/i,
                /^close$/i,
                /^dismiss$/i,
            ];

            const candidates = [...document.querySelectorAll('button, [role="button"], a.btn, a.button')];
            for (const btn of candidates) {
                const label = (btn.textContent || btn.getAttribute('aria-label') || '').trim();
                if (acceptPatterns.some(p => p.test(label)) && btn.offsetParent !== null) {
                    btn.click();
                    return;
                }
            }
        });

        // Brief pause for dismiss animations
        await new Promise(r => setTimeout(r, 800));

        // Pass 2: Dismiss shadow DOM consent managers (e.g. Usercentrics on swissinfo.ch).
        // Strategy A: call the Usercentrics public JS API if available.
        // Strategy B: find the accept button inside the shadow root and fire a real
        //             pointer event via page.mouse.click() (coordinates-based, bypasses
        //             any JS event handling quirks with programmatic .click()).
        try {
            // Strategy A — Usercentrics public API
            await page.evaluate(() => {
                try { if (window.UC_UI) window.UC_UI.acceptAllConsents(); } catch (e) {}
                try { if (window.__ucCmp) window.__ucCmp.acceptAllConsents(); } catch (e) {}
            }).catch(() => {});

            // Strategy B — direct .click() on the shadow DOM button.
            // Calling .click() from inside page.evaluate() has full shadow root access
            // (unlike page.mouse.click which uses viewport coordinates and can miss).
            const shadowBtnCoords = await page.evaluate(() => {
                const selectors = [
                    '.uc-accept-button',
                    'button[data-action-type="accept"]',
                    'button[aria-label="Accept All"]',
                ];
                const hosts = [
                    ...document.querySelectorAll('aside, #usercentrics-root, [data-nosnippet="1"], [id*="usercentrics"], [id*="consent-manager"]'),
                ];
                let scanned = 0;
                for (const el of document.querySelectorAll('*')) {
                    if (el.shadowRoot && !hosts.includes(el)) {
                        hosts.push(el);
                        if (++scanned >= 60) break;
                    }
                }
                for (const host of hosts) {
                    if (!host.shadowRoot) continue;
                    for (const sel of selectors) {
                        const btn = host.shadowRoot.querySelector(sel);
                        if (btn) {
                            // Programmatic click from within evaluate() reaches shadow DOM
                            btn.click();
                            const r = btn.getBoundingClientRect();
                            return { x: Math.max(r.x + r.width / 2, 1), y: Math.max(r.y + r.height / 2, 1) };
                        }
                    }
                }
                return null;
            });

            if (shadowBtnCoords) {
                console.log(`[dismissPopups] shadow-DOM consent button at (${shadowBtnCoords.x.toFixed(0)}, ${shadowBtnCoords.y.toFixed(0)})`);
                // Also fire a coordinate click as a backup (some CMP handlers need real pointer events)
                const navPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                await page.mouse.click(shadowBtnCoords.x, shadowBtnCoords.y);
                await navPromise;
                // Wait for meaningful article body to be present (handles both full reload and SPA update)
                await page.waitForFunction(
                    () => (document.body.innerText || '').length > 2000,
                    { timeout: 10000 }
                ).catch(() => {});
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            // non-fatal
        }

        await new Promise(r => setTimeout(r, 800));

        // Pass 3: hide any remaining fixed/sticky overlays with high z-index
        await page.evaluate(() => {
            // Hide by known banner class/id patterns
            const bannerSelectors = [
                '[class*="cookie-banner"]', '[class*="cookiebanner"]',
                '[class*="cookie-consent"]', '[class*="cookieconsent"]',
                '[class*="cookie-notice"]', '[class*="gdpr-banner"]',
                '[class*="consent-banner"]', '[class*="privacy-banner"]',
                '[id*="cookie-banner"]', '[id*="cookiebanner"]',
                '[id*="cookie-consent"]', '[id*="gdpr-banner"]',
                '#onetrust-banner-sdk', '#onetrust-consent-sdk',
                '.cc-window', '.cc-banner',
                '#qc-cmp2-ui',
            ];
            for (const sel of bannerSelectors) {
                document.querySelectorAll(sel).forEach(el => {
                    el.style.setProperty('display', 'none', 'important');
                });
            }

            // Also hide fixed/sticky elements with very high z-index that cover ≥10% of the viewport.
            // Pre-filter via a targeted selector instead of walking every element on the page —
            // calling getComputedStyle() inside a `*` loop on heavy pages (Medium, paywalls,
            // ad-laden SPAs) can take >180s and trips Puppeteer's protocolTimeout. Real overlays
            // either declare position via inline style or use one of these semantic patterns.
            const viewArea = window.innerWidth * window.innerHeight;
            const overlayCandidates = document.querySelectorAll(
                '[style*="position:fixed"], [style*="position: fixed"],' +
                '[style*="position:sticky"], [style*="position: sticky"],' +
                'header, aside, dialog, [role="dialog"], [role="alertdialog"],' +
                '[class*="banner"], [class*="modal"], [class*="popup"], [class*="overlay"]'
            );
            const MAX_CANDIDATES = 800;
            let i = 0;
            for (const el of overlayCandidates) {
                if (++i > MAX_CANDIDATES) break;
                const style = window.getComputedStyle(el);
                const zIndex = parseInt(style.zIndex) || 0;
                if (zIndex > 999 && (style.position === 'fixed' || style.position === 'sticky')) {
                    const rect = el.getBoundingClientRect();
                    if ((rect.width * rect.height) / viewArea > 0.1) {
                        el.style.setProperty('display', 'none', 'important');
                    }
                }
            }
        });
    } catch (e) {
        console.warn('dismissPopups (non-fatal):', e.message);
    }
}

/**
 * Hides fixed toolbars injected by archive services (Wayback Machine, archive.ph)
 * so they don't appear in the screenshot or skew the clip coordinates.
 */
async function hideArchiveToolbars(page) {
    await page.evaluate(() => {
        const selectors = [
            '#wm-ipp-base',               // Wayback Machine toolbar
            '#wm-ipp',
            '.wb-autocomplete-suggestions',
            '#topbar',                    // archive.ph top bar
            '#logo-bar',                  // archive.ph logo
        ];
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
        }
    }).catch(() => {});
}

/**
 * Normalises a field value — treats the literal strings "null"/"undefined" and
 * empty strings as absent so they never render in the attribution bar.
 */
const normaliseField = (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    return /^(null|undefined)$/i.test(t) ? '' : t;
};

/**
 * Parses a date string into a Date. The client transmits ISO (YYYY-MM-DD), which
 * must be treated as a plain calendar date — `new Date('2026-06-01')` is UTC
 * midnight and would render as "May" in UTC-negative timezones. Dotted numeric
 * dates (9.6.2026) are parsed day-first as a legacy fallback: they come from
 * `toLocaleDateString()` under European locales, where dots always mean
 * day-first, and `new Date()` would misread them month-first.
 * Returns null when the string cannot be parsed into a valid date.
 */
function parseAttributionDate(date) {
    const trimmed = date.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) {
        const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
        return isNaN(d.getTime()) ? null : d;
    }
    const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
    const d = dotted
        ? new Date(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]))
        : new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats the attribution bar text.
 * e.g. "✍ Jane Smith · Feb 2026 · wired.com"
 */
function formatAttribution({ author, date, domain }) {
    author = normaliseField(author);
    date = normaliseField(date);
    domain = normaliseField(domain);
    const parts = ['✍'];

    if (author) parts.push(author);

    if (date) {
        const d = parseAttributionDate(date);
        if (d) {
            const month = d.toLocaleString('en', { month: 'short' });
            parts.push(`${month} ${d.getFullYear()}`);
        }
        // unparseable → skip date rather than render "Invalid Date NaN"
    }

    if (domain) parts.push(domain);

    return parts.join(' · ');
}

/**
 * Pure clip-box computation — runs in Node so it's fully unit-testable.
 *
 * Always spans the full viewport width (x=0, size=viewportWidth) so no text
 * is ever cropped horizontally, regardless of how wide the highlighted span is.
 *
 * @param {{ found: boolean, rect: { x, y, width, height } | null }} foundResult
 * @param {number} viewportWidth  - Puppeteer viewport width (390)
 * @param {number} pageHeight     - document.documentElement.scrollHeight
 */
export function computeClip(foundResult, viewportWidth, pageHeight) {
    const barHeight = 40;

    if (foundResult.found && foundResult.rect) {
        const padding = 30;

        // Always span the full horizontal breadth — never crop text on the right
        const x = 0;
        const size = viewportWidth;

        const rawHeight = foundResult.rect.height + (padding * 2);
        const height = Math.max(size, rawHeight);

        let y = foundResult.rect.y - padding;
        if (y < 0) y = 0;

        const totalHeight = height + barHeight;
        if (y + totalHeight > pageHeight) y = Math.max(0, pageHeight - totalHeight);

        return { x, y, size, height, totalHeight, barHeight };
    }

    // Fallback: full viewport square
    const size = viewportWidth;
    return { x: 0, y: 0, size, height: size, totalHeight: size + barHeight, barHeight };
}

export { formatAttribution };
