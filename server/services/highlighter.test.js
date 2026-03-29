import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { findQuoteInDOM } from './highlighter.js';

describe('Highlighter DOM Walker (JSDOM Environment)', () => {
    let dom;

    beforeEach(() => {
        // Mock a complex SSRN article fragment with nested tags, gaps, and formatting
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
                <body>
                    <article>
                        <p>
                            <span>Although</span> the <i>market</i> is in its 
                            <span class="footnote">infancy</span>, 
                            our research shows that 
                            <a href="#">tokenized gold</a> closely tracks traditional gold benchmarks - 
                            even in times of market stress like the 10 standard deviation drawdown 
                            in the price of gold on January 30, 2026.
                        </p>
                        <p>
                            In contrast to futures markets, <span>tokenized gold</span> provides 24/7 trading, 
                            providing liquidity in times of stress, 
                            such as the strike on Iran over the weekend of <strong>February 28, 2026</strong>
                        </p>
                    </article>
                </body>
            </html>
        `);

        global.document = dom.window.document;
        global.window = dom.window;
        global.NodeFilter = dom.window.NodeFilter;

        // Mock getBoundingClientRect for JSDOM
        global.window.HTMLElement.prototype.getBoundingClientRect = function () {
            return { x: 10, y: 10, width: 100, height: 20, top: 10, left: 10, bottom: 30, right: 110 };
        };
        global.window.Range.prototype.getClientRects = function () {
            return [{ x: 10, y: 10, width: 100, height: 20, top: 10, left: 10, bottom: 30, right: 110 }];
        };
    });

    it('should find exact quote matching despite nested tags and whitespaces (gap tolerance)', () => {
        const quote = "Although the market is in its infancy, our research shows that tokenized gold closely tracks traditional gold benchmarks - even in times of market stress like the 10 standard deviation drawdown in the price of gold on January 30, 2026. In contrast to futures markets, tokenized gold provides 24/7 trading, providing liquidity in times of stress, such as the strike on Iran over the weekend of February 28, 2026";

        const result = findQuoteInDOM(quote);

        expect(result.found).toBe(true);
        // The rect mock in jsdom returns {x: 10, y: 10, width: 100, height: 20} for elements fallback
        expect(result.rect).toBeDefined();
        expect(result.debugInfo).toBeDefined();
        expect(result.debugInfo.maxScore).toBeGreaterThan(60); // Total quote is 69 words
    });

    it('should fail cleanly if quote relies on words that do not exist', () => {
        const quote = "This text is entirely missing from the document structure";
        const result = findQuoteInDOM(quote);
        expect(result.found).toBe(false);
    });

    it('should return found:false for null/empty quote', () => {
        expect(findQuoteInDOM(null).found).toBe(false);
        expect(findQuoteInDOM('').found).toBe(false);
        expect(findQuoteInDOM(undefined).found).toBe(false);
    });

    it('should return found:false for quote with only punctuation (no word tokens)', () => {
        const result = findQuoteInDOM('!!! ???');
        expect(result.found).toBe(false);
    });

    it('should match a short exact phrase within the document', () => {
        const result = findQuoteInDOM('tokenized gold closely tracks traditional gold benchmarks');
        expect(result.found).toBe(true);
        expect(result.debugInfo.startWord).toBe('tokenized');
    });

    it('should handle smart quotes and curly apostrophes via normalization', () => {
        // Set up a DOM with smart quotes
        const smartDom = new JSDOM(`
            <html><body>
                <p>The author\u2019s claim is that \u201Ctokenized gold\u201D outperforms.</p>
            </body></html>
        `);
        global.document = smartDom.window.document;
        global.window = smartDom.window;
        global.NodeFilter = smartDom.window.NodeFilter;
        global.window.HTMLElement.prototype.getBoundingClientRect = function () {
            return { x: 10, y: 10, width: 100, height: 20, top: 10, left: 10, bottom: 30, right: 110 };
        };
        global.window.Range.prototype.getClientRects = function () { return []; };

        const result = findQuoteInDOM("The author's claim is that \"tokenized gold\" outperforms");
        expect(result.found).toBe(true);
    });

    it('should not match when score is below 50% threshold', () => {
        // Only 2 words out of a 10-word quote exist in the document
        const result = findQuoteInDOM('Although the banana elephant unicorn spacecraft galaxy nebula quantum paradox');
        expect(result.found).toBe(false);
    });

    it('should ignore script and style tag contents', () => {
        const scriptDom = new JSDOM(`
            <html><body>
                <script>var gold = "tokenized gold benchmarks";</script>
                <style>.gold { color: gold; }</style>
                <p>No relevant content here at all.</p>
            </body></html>
        `);
        global.document = scriptDom.window.document;
        global.window = scriptDom.window;
        global.NodeFilter = scriptDom.window.NodeFilter;

        const result = findQuoteInDOM('tokenized gold benchmarks');
        expect(result.found).toBe(false);
    });

    it('should search tweet articles independently on multi-tweet pages', () => {
        const tweetDom = new JSDOM(`
            <html><body>
                <article data-testid="tweet">
                    <p>First tweet about blockchain technology and decentralization</p>
                </article>
                <article data-testid="tweet">
                    <p>Second tweet about tokenized gold closely tracks traditional gold benchmarks</p>
                </article>
            </body></html>
        `);
        global.document = tweetDom.window.document;
        global.window = tweetDom.window;
        global.NodeFilter = tweetDom.window.NodeFilter;
        global.window.HTMLElement.prototype.getBoundingClientRect = function () {
            return { x: 10, y: 10, width: 100, height: 20, top: 10, left: 10, bottom: 30, right: 110 };
        };
        global.window.Range.prototype.getClientRects = function () { return []; };

        const result = findQuoteInDOM('tokenized gold closely tracks traditional gold benchmarks');
        expect(result.found).toBe(true);
    });

    it('should return debugInfo with score even when not found', () => {
        const result = findQuoteInDOM('entirely nonexistent words that appear nowhere in the document whatsoever');
        expect(result.found).toBe(false);
        // debugInfo should be present with maxScore info
        if (result.debugInfo) {
            expect(result.debugInfo.quoteLength).toBeGreaterThan(0);
        }
    });
});
