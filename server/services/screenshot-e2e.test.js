import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { captureQuoteScreenshot } from './screenshotService.js';
import { uploadImage } from './imageHostService.js';
import * as scraperService from './scraperService.js';
import { setSetting } from './db.js';

// Seed IMGBB_API_KEY into SQLite if available in environment (e.g. from CI or local shell)
beforeAll(async () => {
    if (process.env.IMGBB_API_KEY) {
        await setSetting('IMGBB_API_KEY', process.env.IMGBB_API_KEY);
    }
});

// DO NOT MOCK PUPPETEER globally in this test, this is a real E2E integration test.
// We only spy on getBrowser to intercept the moment before capture.

describe.skip('Screenshot E2E Integration', () => {

    const testCases = [
        {
            name: 'Simon Willison Codespaces',
            url: 'https://til.simonwillison.net/github/codespaces-devcontainers',
            quote: "I'm a huge fan of Codespaces for running workshops: it means you can skip that awful half hour at the beginning of any workshop where you try to ensure everyone has a working development environment.",
            attribution: {
                author: 'Simon Willison',
                date: '2022-10-31',
                domain: 'til.simonwillison.net'
            },
            expectedHighlightText: "Codespaces for running workshops"
        },
        {
            name: 'Steve Krouse API UX',
            url: 'https://stevekrouse.com/x402',
            quote: "The worst part is that before you can try an API, you usually have no idea:\n\nHow long sign-up will take\nWhether you'll need a credit card\nWhether the API is actually useful\n\nYou're at the mercy of the provider, and you just pray they care about developer experience.",
            attribution: {
                author: 'Steve Krouse',
                date: '2024-01-01',
                domain: 'stevekrouse.com'
            },
            expectedHighlightText: "mercy of the provider"
        }
    ];

    it.each(testCases)('should navigate, highlight, inject attribution, and upload to ImgBB for $name', async ({ url, quote, attribution, expectedHighlightText }) => {
        let domState = {};

        // 1. Spy on acquireBrowser to intercept the page object
        const originalAcquireBrowser = scraperService.acquireBrowser;
        vi.spyOn(scraperService, 'acquireBrowser').mockImplementation(async () => {
            const browser = await originalAcquireBrowser();
            const originalNewPage = browser.newPage.bind(browser);

            browser.newPage = async () => {
                const page = await originalNewPage();
                const originalScreenshot = page.screenshot.bind(page);

                // Intercept screenshot to verify DOM right before capture
                page.screenshot = async (options) => {
                    // Verify highlight (returns background color and text)
                    domState.highlight = await page.evaluate(() => {
                        // The highlighter.js script injects absolutely positioned translucent yellow divs over the text
                        const overlays = Array.from(document.querySelectorAll('div')).filter(div => {
                            const bg = div.style.backgroundColor;
                            return div.style.zIndex === '99999' && (bg === 'rgb(255, 235, 59)' || bg.includes('FFEB3B'));
                        });

                        if (overlays.length === 0) return null;

                        return {
                            count: overlays.length,
                            bgColor: overlays[0].style.backgroundColor,
                            opacity: overlays[0].style.opacity
                        };
                    });

                    // Verify attribution bar
                    domState.attribution = await page.evaluate(() => {
                        const bar = document.getElementById('raindrop-attribution');
                        if (!bar) return null;
                        return bar.textContent;
                    });

                    return originalScreenshot(options);
                };
                return page;
            };
            return browser;
        });

        // 2. Capture the screenshot natively (this runs puppeteer and findQuoteInDOM behind the scenes)
        const buffer = await captureQuoteScreenshot(url, quote, attribution);

        // Assertions on DOM state BEFORE screenshot
        expect(domState.highlight).toBeDefined();
        // Check for the #FFEB3B color rgb(255, 235, 59)
        expect(domState.highlight.bgColor).toMatch(/rgb\(255,\s*235,\s*59\)|#FFEB3B/i);
        expect(domState.highlight.opacity).toBe('0.4');
        expect(domState.highlight.count).toBeGreaterThan(0);

        expect(domState.attribution).toBeDefined();

        // Sometimes the scraper might not find the author/date, but it MUST inject the domain
        expect(domState.attribution).toContain(attribution.domain);

        // Assertions on Screenshot Buffer
        expect(buffer).toBeInstanceOf(Buffer);
        // Ensure it's not a tiny broken image
        expect(buffer.length).toBeGreaterThan(10000);

        // 3. Upload to real ImgBB (key should be in SQLite via beforeAll seed or Setup page)
        const imgbbKey = await import('./db.js').then(m => m.getSetting('IMGBB_API_KEY'));
        expect(imgbbKey).toBeDefined();
        const uploadResult = await uploadImage(buffer);

        expect(uploadResult).toHaveProperty('url');
        expect(uploadResult.url).toMatch(/^https:\/\/i\.ibb\.co\//);

        console.log(`✅ E2E Screenshot verified for ${url} and uploaded to: ${uploadResult.url}`);

        // Restore spy for the next iteration
        vi.restoreAllMocks();
    }, 60000); // 60s timeout for full network navigation and upload
});
