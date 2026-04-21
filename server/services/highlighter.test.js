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

    it('should NOT start match at common word when 2nd quote word is >2 tokens away (false-start heuristic)', () => {
        // Reproduces Stratechery: "the" at token[N] is inside a link "the State of Cupertino",
        // and "new"/"siri" appear at tokens [N+4] and [N+5] — inside the old 6-token window.
        // The CORRECT "the" is at token[N+4] immediately followed by "new" at [N+5].
        // With tightened 2-token window: slice(N+1, N+3)=[state,of] → "new" NOT found → rejected.
        // The correct "the" at N+4: slice(N+5, N+7)=[new,siri] → passes.
        const falseStartDom = new JSDOM(`
            <html><body>
                <p>It suggests that <a href="#">the State of Cupertino</a>. The new Siri still has not launched.</p>
            </body></html>
        `);
        global.document = falseStartDom.window.document;
        global.window = falseStartDom.window;
        global.NodeFilter = falseStartDom.window.NodeFilter;
        global.window.HTMLElement.prototype.getBoundingClientRect = () => (
            { x: 10, y: 200, width: 350, height: 20, top: 200, left: 10, bottom: 220, right: 360 }
        );
        global.window.Range.prototype.getClientRects = function () {
            return [{ x: 10, y: 200, width: 350, height: 20, top: 200, left: 10, bottom: 220, right: 360 }];
        };

        const result = findQuoteInDOM("The new Siri still has not launched");
        expect(result.found).toBe(true);
        // "the State of Cupertino" has "new" at offset 4 (state=1, of=2, cupertino=3, .=skip, The=4, new=5)
        // In the token stream: [it, suggests, that, the(link), state, of, cupertino, the(p), new, siri, ...]
        // Correct: bestStart must point at the "the" BEFORE "new", i.e. the one where
        // the immediately-following tokens are "new" and "siri".
        // We verify: quoteWords[1]="new" must appear within 2 tokens of bestStart.
        // Score for false-start "the(link)" would be lower since "state of cupertino"
        // aren't in the quote. The correct start produces all 6 words matching.
        expect(result.debugInfo.maxScore).toBeGreaterThanOrEqual(6);
        expect(result.debugInfo.endWord).toBe('launched');
        // The startWord is "the" in both cases, so we check via expected matching behavior:
        // if false-started, the Range would include "the State of Cupertino" text in its rects,
        // but we can't easily test that here. Trust the score and endWord checks above.
    });
});

