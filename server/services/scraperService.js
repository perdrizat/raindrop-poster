import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

let browserInstance = null;

/**
 * Returns a shared Puppeteer browser instance (lazy singleton).
 * Reused across scraping and screenshot operations.
 */
export const getBrowser = async () => {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            ignoreDefaultArgs: ["--enable-automation"],
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
        });
    }
    return browserInstance;
};

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
    let page;
    try {
        const browser = await getBrowser();
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
        if (page) {
            await page.close().catch(() => { });
        }
    }
};
