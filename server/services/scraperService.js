import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createPool } from 'generic-pool';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

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

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

/**
 * Extracts article content from raw HTML using Mozilla Readability,
 * then converts to markdown via Turndown.
 *
 * @param {string} rawHtml - Full page HTML
 * @param {string} url - The page URL (used by Readability for relative link resolution)
 * @returns {{ markdown: string, html: string } | null}
 */
function extractArticle(rawHtml, url) {
    try {
        const dom = new JSDOM(rawHtml, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        if (!article || !article.content) return null;

        const markdown = turndown.turndown(article.content);
        return { markdown, html: article.content };
    } catch {
        return null;
    }
}

/**
 * Scrapes article content from a URL using Puppeteer.
 * Returns { markdown, html } via Readability extraction.
 * Falls back to plain text extraction if Readability can't parse the page.
 *
 * @param {string} url
 * @returns {Promise<{ markdown: string, html: string }>}
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
            return { markdown: data.text || '', html: '' };
        } catch (error) {
            console.error('vxtwitter fallback error:', error.message);
            throw new Error('Failed to scrape the article.');
        }
    }

    // 2. Default Puppeteer path
    const browser = await acquireBrowser();
    let page;
    try {
        page = await browser.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Grab full page HTML for Readability
        const rawHtml = await page.content();
        const extracted = extractArticle(rawHtml, url);

        if (extracted && extracted.markdown.trim().length > 0) {
            return {
                markdown: extracted.markdown.substring(0, 50000),
                html: extracted.html,
            };
        }

        // Fallback: plain text extraction (same as before)
        const text = await page.evaluate(() => {
            const removeSelectors = 'script, style, nav, footer, header, aside, iframe, noscript';
            document.querySelectorAll(removeSelectors).forEach(el => el.remove());

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

        const cleanText = text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();

        return { markdown: cleanText.substring(0, 50000), html: '' };
    } catch (error) {
        console.error('Scraping error:', error.message);
        throw new Error('Failed to scrape the article.');
    } finally {
        if (page) await page.close().catch(() => {});
        releaseBrowser(browser);
    }
};
