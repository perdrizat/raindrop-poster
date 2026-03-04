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
});
