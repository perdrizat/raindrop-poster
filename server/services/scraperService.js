import axios from 'axios';
import * as cheerio from 'cheerio';

export const scrapeArticle = async (url) => {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; RaindropPoster/1.0)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000 // 10 second timeout
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Remove script, style, and navigation tags
        $('script, style, nav, footer, header, aside, iframe, noscript').remove();

        // Try to find the main article container
        let articleBody = $('article').text();

        if (!articleBody || articleBody.trim().length === 0) {
            articleBody = $('main').text();
        }

        if (!articleBody || articleBody.trim().length === 0) {
            // Fallback to body text
            articleBody = $('body').text();
        }

        // Clean up whitespace
        const cleanText = articleBody
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, '\n')
            .trim();

        // Truncate if insanely long to save LLM tokens (e.g. 50k chars max)
        return cleanText.substring(0, 50000);
    } catch (error) {
        console.error('Scraping error:', error.message);
        throw new Error('Failed to scrape the article.');
    }
};
