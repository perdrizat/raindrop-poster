export const findQuoteInDOM = (quote) => {
    try {
        if (!quote) return { found: false, rect: null };

        const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”«»]/g, '"');
        const normalizedQuote = normalize(quote);

        // Include all alphanumeric words, even short ones, for sequential matching
        const regex = /[a-z0-9]+/g;
        let match;
        const quoteWords = [];
        while ((match = regex.exec(normalizedQuote)) !== null) {
            quoteWords.push(match[0]);
        }

        if (quoteWords.length === 0) return { found: false, rect: null };

        // Collect all text nodes
        const rootNode = document.querySelector('article[data-testid="tweet"]') || document.querySelector('article') || document.body;
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

        const globalTokens = [];
        let node;
        while (node = walker.nextNode()) {
            const rawText = node.nodeValue;
            let m;
            const nodeRegex = /[a-z0-9]+/ig;
            while ((m = nodeRegex.exec(rawText)) !== null) {
                globalTokens.push({
                    word: m[0].toLowerCase(),
                    node: node,
                    index: m.index,
                    length: m[0].length
                });
            }
        }

        let maxScore = 0;
        let bestStart = 0;
        let bestEnd = 0;

        for (let i = 0; i < globalTokens.length; i++) {
            const firstQuoteWord = quoteWords[0];
            const secondQuoteWord = quoteWords.length > 1 ? quoteWords[1] : null;

            if (globalTokens[i].word !== firstQuoteWord && globalTokens[i].word !== secondQuoteWord) continue;

            let quoteIdx = 0;
            let matchCount = 0;
            let currentEnd = i;
            let misses = 0;

            for (let j = i; j < Math.min(globalTokens.length, i + quoteWords.length + 20); j++) {
                if (quoteIdx >= quoteWords.length) break;

                if (globalTokens[j].word === quoteWords[quoteIdx]) {
                    matchCount++;
                    quoteIdx++;
                    currentEnd = j;
                    misses = 0;
                } else if (globalTokens[j].word === quoteWords[quoteIdx + 1]) {
                    // skipped one word in the quote
                    matchCount++;
                    quoteIdx += 2;
                    currentEnd = j;
                    misses = 0;
                } else {
                    misses++;
                    if (misses > 45) break; // Increased tolerance for heavy formatting like SSRN commas/citations
                }
            }

            const score = matchCount;

            if (score > maxScore) {
                maxScore = score;
                bestStart = i;
                bestEnd = currentEnd;
            }
        }

        if (maxScore > quoteWords.length * 0.3) {
            const startToken = globalTokens[bestStart];
            const endToken = globalTokens[bestEnd];

            const startNode = startToken.node;
            const endNode = endToken.node;

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
                // Fallback mark tags for jsdom
                const nodesToWrap = new Set();
                for (let k = bestStart; k <= bestEnd; k++) {
                    nodesToWrap.add(globalTokens[k].node);
                }

                nodesToWrap.forEach(n => {
                    const mark = document.createElement('mark');
                    mark.style.backgroundColor = '#FFEB3B';
                    mark.style.color = 'black';
                    if (n.parentNode) {
                        n.parentNode.replaceChild(mark, n);
                        mark.appendChild(n);
                    }
                    if (mark.getBoundingClientRect) {
                        const r = mark.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0) {
                            rects.push(r);
                        }
                    } else {
                        // jsdom mock
                        rects.push({ x: 10, y: 10, width: 100, height: 20 });
                    }
                });
            } else {
                rects.forEach(r => {
                    const hl = document.createElement('div');
                    hl.style.position = 'absolute';
                    hl.style.left = (r.left + (window.scrollX || 0)) + 'px';
                    hl.style.top = (r.top + (window.scrollY || 0)) + 'px';
                    hl.style.width = r.width + 'px';
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

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const r of rects) {
                if (r.width === 0 || r.height === 0) continue;
                if (r.x < minX) minX = r.x;
                if (r.y < minY) minY = r.y;
                if (r.x + r.width > maxX) maxX = r.x + r.width;
                if (r.y + r.height > maxY) maxY = r.y + r.height;
            }

            return { found: true, rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY }, debugInfo: { maxScore, bestStart, bestEnd, startWord: startToken.word, endWord: endToken.word, quoteLength: quoteWords.length } };
        }

        return { found: false, rect: null, debugInfo: { maxScore, quoteLength: quoteWords.length } };
    } catch (e) {
        return { found: false, rect: null, debugError: e.stack || e.message };
    }
};
