import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createPool } from 'generic-pool';

puppeteer.use(StealthPlugin());

const LAUNCH_OPTS = {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    headless: true,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--font-render-hinting=none'],
};

/**
 * Single-browser pool. min=max=1 — one warm instance always ready.
 * testOnBorrow validates the browser is still connected before use;
 * if it crashed, generic-pool destroys it and creates a fresh one automatically.
 */
const browserPool = createPool(
    {
        create:   ()        => puppeteer.launch(LAUNCH_OPTS),
        destroy:  (browser) => browser.close().catch(() => {}),
        validate: (browser) => Promise.resolve(browser.connected),
    },
    {
        min: 1,
        max: 1,
        testOnBorrow: true,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 600000,       // 10 min idle before teardown
        evictionRunIntervalMillis: 60000,
    }
);

export const acquireBrowser = () => browserPool.acquire();
export const releaseBrowser = (browser) => browserPool.release(browser);
export const shutdownPool = async () => { await browserPool.drain(); browserPool.clear(); };

/**
 * Scrapes article text from a URL using Puppeteer.
 * Prefers <article>, falls back to <main>, then <body>.
 */
export const scrapeArticle = async (url) => {
    // 1. Intercept X/Twitter URLs to bypass headless browser blockers
    const twitterRegex = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)/i;
    const match = url.match(twitterRegex);

    if (match) {
        const handle = match[1];
        const tweetId = match[2];
        try {
            const vxUrl = `https://api.vxtwitter.com/${handle}/status/${tweetId}`;
            const response = await fetch(vxUrl);
            if (!response.ok) {
                throw new Error(`vxtwitter API returned ${response.status}`);
            }
            const data = await response.json();
            return data.text || '';
        } catch (error) {
            console.error('vxtwitter fallback error:', error.message);
            throw new Error('Failed to scrape the article.');
        }
    }

    // 2. Default Puppeteer fallback
    const browser = await acquireBrowser();
    let page;
    try {
        page = await browser.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const text = await page.evaluate(() => {
            // Remove noise elements
            const removeSelectors = 'script, style, nav, footer, header, aside, iframe, noscript';
            document.querySelectorAll(removeSelectors).forEach(el => el.remove());

            // Try article > main > body
            const article = document.querySelector('article');
            if (article && article.textContent.trim().length > 0) {
                return article.textContent;
            }

            const main = document.querySelector('main');
            if (main && main.textContent.trim().length > 0) {
                return main.textContent;
            }

            return document.body.textContent;
        });

        // Clean up whitespace and truncate
        const cleanText = text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();

        return cleanText.substring(0, 50000);
    } catch (error) {
        console.error('Scraping error:', error.message);
        throw new Error('Failed to scrape the article.');
    } finally {
        if (page) await page.close().catch(() => {});
        releaseBrowser(browser);
    }
};
