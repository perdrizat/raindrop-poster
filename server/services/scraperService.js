import puppeteer from 'puppeteer';

let browserInstance = null;

/**
 * Returns a shared Puppeteer browser instance (lazy singleton).
 * Reused across scraping and screenshot operations.
 */
export const getBrowser = async () => {
    if (!browserInstance || !browserInstance.connected) {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }
    return browserInstance;
};

/**
 * Scrapes article text from a URL using Puppeteer.
 * Prefers <article>, falls back to <main>, then <body>.
 */
export const scrapeArticle = async (url) => {
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
