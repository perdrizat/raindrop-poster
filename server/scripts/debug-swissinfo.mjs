#!/usr/bin/env node
/**
 * debug-swissinfo.mjs — throw-away debug script for diagnosing quote-finding
 * failures across all 5 test URLs.
 *
 * Checks for each URL:
 *   - Is the quote text present in document.body.innerText?
 *   - What does document.querySelector('article') return?
 *   - Does findQuoteInDOM succeed?
 *
 * Usage:
 *   node server/scripts/debug-swissinfo.mjs
 */

import { acquireBrowser, releaseBrowser, shutdownPool } from '../services/scraperService.js';
import { findQuoteInDOM } from '../services/highlighter.js';

process.env.NODE_ENV = 'e2e';

const CASES = [
    {
        name: 'SlowMist Medium',
        url: 'https://slowmist.medium.com/the-cat-and-mouse-dilemma-of-vasps-under-compliance-pressure-1255780f65da',
        quote: 'Infrastructure Seizures: Garantex had its servers shut down and faced criminal charges in a joint operation by the United States and Europe.',
    },
    {
        name: 'X vxtwitter',
        url: 'https://vxtwitter.com/iang_fc/status/2034408765127053540',
        quote: "The *outcome* of this is a bifurcation. Crypto will fork.",
    },
    {
        name: 'Continuations',
        url: 'https://continuations.com/more-lazy-employment-thinking-jevons-paradox-edition',
        quote: "Consider a 90% labor savings and now ask how much would units produced have to grow to at least offset this?",
    },
    {
        name: 'SwissInfo',
        url: 'https://www.swissinfo.ch/eng/research-frontiers/ig-nobels-to-move-awards-to-switzerland-due-to-concern-over-us-travel-visas/91073250',
        quote: "But four of the 10 winners last year chose not to travel to Boston for the ceremony. In previous years, the ceremony has taken place at Harvard University, Massachusetts Institute of Technology and Boston University.",
    },
    {
        name: 'Sherlock xyz',
        url: 'https://sherlock.xyz/post/institutional-crypto-adoption-in-2026-whos-actually-moving-in',
        quote: 'Institutional adoption is a balance sheet reality. $123.5 billion in Bitcoin ETF assets.',
    },
];

const URL = CASES[3].url;
const QUOTE = CASES[3].quote;

const browser = await acquireBrowser();
const page = await browser.newPage();

await page.setViewport({ width: 390, height: 8000, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.setRequestInterception(true);
page.on('request', req => req.continue());

console.log('Navigating…');
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => {});
await new Promise(r => setTimeout(r, 3000));

// --- 1. Is the quote text in the DOM? ---
const domInfo = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const p = node.parentNode;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    let textNodeCount = 0;
    let textContent = '';
    let node;
    while ((node = walker.nextNode())) {
        textNodeCount++;
        textContent += node.nodeValue;
    }

    const hasBut = bodyText.includes('But four');
    return {
        bodyTextLen: bodyText.length,
        textContentLen: textContent.length,
        textNodeCount,
        hasBut,
        butContext: hasBut
            ? bodyText.substring(bodyText.indexOf('But four') - 50, bodyText.indexOf('But four') + 150)
            : 'NOT FOUND',
    };
});

console.log('\n--- DOM info ---');
console.log(JSON.stringify(domInfo, null, 2));

// --- 1b. What does querySelector('article') return? ---
const articleInfo = await page.evaluate(() => {
    const article = document.querySelector('article');
    if (!article) return { found: false };
    const text = article.innerText || '';
    return {
        found: true,
        tag: article.tagName,
        classes: article.className,
        textLen: text.length,
        hasBut: text.includes('But four'),
        textSample: text.substring(0, 200),
    };
});
console.log('\n--- article element ---');
console.log(JSON.stringify(articleInfo, null, 2));

// --- 2. Inspect the token stream around "but" ---
const tokenDebug = await page.evaluate(() => {
    const tokens = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const p = node.parentNode;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    let node;
    const wordRe = /[a-z0-9]+/ig;
    while ((node = walker.nextNode())) {
        let m;
        while ((m = wordRe.exec(node.nodeValue)) !== null) {
            tokens.push(m[0].toLowerCase());
        }
    }

    // Find all positions of "but" and show surrounding context
    const butPositions = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === 'but') {
            butPositions.push({
                pos: i,
                window: tokens.slice(Math.max(0, i - 2), i + 12).join(' '),
                hasFourNearby: tokens.slice(i + 1, i + 7).includes('four'),
            });
        }
    }
    return { totalTokens: tokens.length, butPositions: butPositions.slice(0, 10) };
});

console.log('\n--- Token debug ---');
console.log('Total tokens:', tokenDebug.totalTokens);
console.log('"but" occurrences (first 10):');
tokenDebug.butPositions.forEach(p => {
    console.log(`  pos ${p.pos}: [${p.window}]  hasFourNearby=${p.hasFourNearby}`);
});

// --- 3. Does findQuoteInDOM find the quote? ---
const findResult = await page.evaluate(findQuoteInDOM, QUOTE);
console.log('\n--- findQuoteInDOM result ---');
console.log(JSON.stringify(findResult, null, 2));

await page.close();
releaseBrowser(browser);
await shutdownPool();
