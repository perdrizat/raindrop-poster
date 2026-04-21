/**
 * Finds a quote in the page DOM, highlights it with yellow overlay divs,
 * and returns the bounding rect for screenshot clipping.
 *
 * IMPORTANT: All helper functions must be defined INSIDE findQuoteInDOM.
 * page.evaluate() serialises only the function body — helpers defined at
 * module scope are not visible in the browser context and will throw
 * ReferenceError at runtime.
 *
 * Multi-tweet pages (vxtwitter / x.com threads) are handled by searching
 * each tweet article independently — this prevents the fuzzy matcher from
 * spanning across tweet boundaries and producing spurious over-matches.
 *
 * Match threshold: a candidate must cover ≥ 50% of the quote words to be
 * accepted (was 30% — raised to reduce false positives on threaded content).
 *
 * "First 3 words" heuristic: when scanning for a start position, require
 * that the 2nd and 3rd quote words also appear within the next 6 tokens.
 * This avoids false starts on common words like "the", "but", "a".
 */
export const findQuoteInDOM = (quote) => {
    try {
        if (!quote) return { found: false, rect: null };

        // ── Helpers (must be inline for page.evaluate serialisation) ──────────

        function collectTokens(rootNode) {
            const tokens = [];
            const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    const parent = node.parentNode;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || parent.tagName === 'NOSCRIPT') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }, false);

            let node;
            while (node = walker.nextNode()) {
                const rawText = node.nodeValue;
                let m;
                const nodeRegex = /[a-z0-9]+/ig;
                while ((m = nodeRegex.exec(rawText)) !== null) {
                    tokens.push({ word: m[0].toLowerCase(), node, index: m.index, length: m[0].length });
                }
            }
            return tokens;
        }

        function scoreTokens(tokens, quoteWords) {
            let maxScore = 0;
            let bestStart = 0;
            let bestEnd = 0;

            const firstQuoteWord  = quoteWords[0];
            const secondQuoteWord = quoteWords.length > 1 ? quoteWords[1] : null;
            const thirdQuoteWord  = quoteWords.length > 2 ? quoteWords[2] : null;

            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i].word !== firstQuoteWord) continue;

                // "First 3 words" heuristic: before committing to this start
                // position, verify the 2nd (and 3rd) quote words appear among
                // the NEXT 2 tokens only. A window of 6 was too permissive —
                // e.g. "the" in "the State of Cupertino" would fire because
                // "new" and "siri" appeared 4-5 tokens later.
                if (secondQuoteWord) {
                    const nearby = tokens.slice(i + 1, i + 3).map(function(t) { return t.word; });
                    if (nearby.indexOf(secondQuoteWord) === -1) continue;
                    if (thirdQuoteWord && nearby.indexOf(thirdQuoteWord) === -1) continue;
                }

                let quoteIdx = 0;
                let matchCount = 0;
                let currentEnd = i;
                let misses = 0;

                for (let j = i; j < Math.min(tokens.length, i + quoteWords.length + 20); j++) {
                    if (quoteIdx >= quoteWords.length) break;

                    if (tokens[j].word === quoteWords[quoteIdx]) {
                        matchCount++;
                        quoteIdx++;
                        currentEnd = j;
                        misses = 0;
                    } else if (tokens[j].word === quoteWords[quoteIdx + 1]) {
                        // skipped one word in the quote
                        matchCount++;
                        quoteIdx += 2;
                        currentEnd = j;
                        misses = 0;
                    } else {
                        misses++;
                        if (misses > 45) break; // tolerance for heavy formatting
                    }
                }

                if (matchCount > maxScore) {
                    maxScore = matchCount;
                    bestStart = i;
                    bestEnd = currentEnd;
                }
            }

            return { maxScore, startIdx: bestStart, endIdx: bestEnd };
        }

        function applyHighlights(tokens, bestStart, bestEnd, maxScore, quoteLength) {
            const startToken = tokens[bestStart];
            const endToken   = tokens[bestEnd];

            const startNode = startToken.node;
            const endNode   = endToken.node;

            const range = document.createRange();
            range.setStart(startNode, startToken.index);
            range.setEnd(endNode, endToken.index + endToken.length);

            if (startNode.parentElement && startNode.parentElement.scrollIntoView) {
                try {
                    startNode.parentElement.scrollIntoView({ behavior: 'instant', block: 'center' });
                } catch (e) { }
            }

            let rects = [];
            let clientRectsList;
            try {
                clientRectsList = range.getClientRects();
            } catch (e) { clientRectsList = []; }

            for (let i = 0; i < clientRectsList.length; i++) {
                rects.push(clientRectsList[i]);
            }


            if (rects.length === 0) {
                // Fallback: wrap nodes in <mark> tags (used by jsdom in tests)
                const nodesToWrap = new Set();
                for (let k = bestStart; k <= bestEnd; k++) {
                    nodesToWrap.add(tokens[k].node);
                }

                nodesToWrap.forEach(function(n) {
                    const mark = document.createElement('mark');
                    mark.style.backgroundColor = '#FFEB3B';
                    mark.style.color = 'black';
                    if (n.parentNode) {
                        n.parentNode.replaceChild(mark, n);
                        mark.appendChild(n);
                    }
                    if (mark.getBoundingClientRect) {
                        const r = mark.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0) rects.push(r);
                    } else {
                        rects.push({ x: 10, y: 10, width: 100, height: 20 });
                    }
                });
            } else {
                rects.forEach(function(r) {
                    const hl = document.createElement('div');
                    hl.style.position = 'absolute';
                    hl.style.left = (r.left + (window.scrollX || 0)) + 'px';
                    hl.style.top  = (r.top  + (window.scrollY || 0)) + 'px';
                    hl.style.width  = r.width  + 'px';
                    hl.style.height = r.height + 'px';
                    hl.style.backgroundColor = '#FFEB3B';
                    hl.style.opacity = '0.4';
                    hl.style.pointerEvents = 'none';
                    hl.style.zIndex = '99999';
                    document.body.appendChild(hl);
                });
            }

            if (rects.length === 0) {
                return { found: false, rect: null };
            }

            // getClientRects() returns viewport-relative coordinates. After scrollIntoView()
            // the page has scrolled, so we must add window.scrollX/Y to convert to
            // document-absolute coordinates (which is what page.screenshot({ clip }) expects).
            const scrollX = window.scrollX || 0;
            const scrollY = window.scrollY || 0;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < rects.length; i++) {
                const r = rects[i];
                if (r.width === 0 || r.height === 0) continue;
                if (r.x + scrollX < minX) minX = r.x + scrollX;
                if (r.y + scrollY < minY) minY = r.y + scrollY;
                if (r.x + scrollX + r.width  > maxX) maxX = r.x + scrollX + r.width;
                if (r.y + scrollY + r.height > maxY) maxY = r.y + scrollY + r.height;
            }

            // Build a short "context window" of tokens around the start/end
            // so we can see exactly where the match anchored in the article
            // (e.g. "...in the State of Cupertino. [the] new siri still...").
            const ctxBefore = 6, ctxAfter = 6;
            const startCtx = tokens.slice(Math.max(0, bestStart - ctxBefore), Math.min(tokens.length, bestStart + ctxAfter)).map(t => t.word).join(' ');
            const endCtx   = tokens.slice(Math.max(0, bestEnd - ctxBefore),   Math.min(tokens.length, bestEnd   + ctxAfter)).map(t => t.word).join(' ');

            return {
                found: true,
                rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
                debugInfo: { maxScore, bestStart, bestEnd, startWord: startToken.word, endWord: endToken.word, quoteLength, startCtx, endCtx }
            };
        }

        // ── Main logic ─────────────────────────────────────────────────────────

        const normalize = function(text) {
            return text.replace(/\s+/g, ' ').trim().toLowerCase()
                .replace(/[''`´]/g, "'").replace(/[""«»]/g, '"');
        };
        const normalizedQuote = normalize(quote);

        const regex = /[a-z0-9]+/g;
        let match;
        const quoteWords = [];
        while ((match = regex.exec(normalizedQuote)) !== null) {
            quoteWords.push(match[0]);
        }

        if (quoteWords.length === 0) return { found: false, rect: null };

        // For multi-tweet pages (threads), search each tweet article separately
        // to prevent the matcher crossing tweet boundaries.
        // For all other pages, search document.body directly — using
        // querySelector('article') is unreliable because many sites have multiple
        // <article> elements (e.g. sidebar teasers) and the first one found may
        // not be the main content. The 50% score threshold and "first 3 words"
        // heuristic already prevent false positives across the full body.
        const tweetArticles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        const searchRoots = tweetArticles.length > 0
            ? tweetArticles
            : [document.body];

        let bestScore  = 0;
        let bestTokens = [];
        let bestStart  = 0;
        let bestEnd    = 0;

        for (let ri = 0; ri < searchRoots.length; ri++) {
            const tokens = collectTokens(searchRoots[ri]);
            const result = scoreTokens(tokens, quoteWords);

            if (result.maxScore > bestScore) {
                bestScore  = result.maxScore;
                bestTokens = tokens;
                bestStart  = result.startIdx;
                bestEnd    = result.endIdx;
            }
        }

        // Require at least half the quote words to match
        if (bestScore <= quoteWords.length * 0.5) {
            return { found: false, rect: null, debugInfo: { maxScore: bestScore, quoteLength: quoteWords.length } };
        }

        return applyHighlights(bestTokens, bestStart, bestEnd, bestScore, quoteWords.length);

    } catch (e) {
        return { found: false, rect: null, debugError: e.stack || e.message };
    }
};
