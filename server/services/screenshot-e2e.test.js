import { describe, it, expect, afterAll } from 'vitest';
import { captureQuoteScreenshot } from './screenshotService.js';
import { scrapeArticle, shutdownPool } from './scraperService.js';
import fs from 'fs';
import path from 'path';

/**
 * Screenshot E2E Integration Tests
 *
 * These tests exercise the FULL production pipeline:
 *   1. Scrape the article via Puppeteer → get { markdown, html }
 *   2. Pass the extracted HTML to captureQuoteScreenshot (local rendering path)
 *   3. Save the PNG to /tmp/raindrop-screenshots/ for visual inspection
 *   4. Verify the image was produced and is a reasonably-sized PNG
 *
 * VISUAL VERIFICATION:
 *   After the test run, the saved images should be inspected (by Claude Code
 *   or a human) to confirm:
 *     (i)   The correct quote is highlighted in yellow
 *     (ii)  Nothing else is highlighted
 *     (iii) No cookie banner / overlay visible
 *     (iv)  Attribution bar is present at the bottom
 *
 * Run with:
 *   cd server && npx vitest run --config vitest.e2e.config.js
 */

const OUTPUT_DIR = '/tmp/raindrop-screenshots';

const TEST_CASES = [
    {
        name: 'Simon Willison Codespaces',
        url: 'https://til.simonwillison.net/github/codespaces-devcontainers',
        quote: "I'm a huge fan of Codespaces for running workshops: it means you can skip that awful half hour at the beginning of any workshop where you try to ensure everyone has a working development environment.",
        attribution: { author: 'Simon Willison', date: '2022-10-31', domain: 'til.simonwillison.net' },
    },
    {
        name: 'Steve Krouse API UX',
        url: 'https://stevekrouse.com/x402',
        quote: "The worst part is that before you can try an API, you usually have no idea:\n\nHow long sign-up will take\nWhether you'll need a credit card\nWhether the API is actually useful\n\nYou're at the mercy of the provider, and you just pray they care about developer experience.",
        attribution: { author: 'Steve Krouse', date: '2024-01-01', domain: 'stevekrouse.com' },
    },
    {
        name: 'SlowMist Medium — multi-paragraph quote',
        url: 'https://slowmist.medium.com/the-cat-and-mouse-dilemma-of-vasps-under-compliance-pressure-1255780f65da',
        quote: 'Infrastructure Seizures: Garantex had its servers shut down and faced criminal charges in a joint operation by the United States and Europe.\nComprehensive Sanctions and Blacklisting: Payeer was placed on the EU sanctions list, prohibiting any entity within the European Union from transacting with it.\nOperational Bans: India directly blocked more than 20 platforms, including BingX, LBank, and Poloniex.',
        attribution: { author: 'SlowMist', date: '3-25', domain: 'slowmist.medium.com' },
    },
    {
        name: 'X vxtwitter — tweet thread',
        url: 'https://x.com/iang_fc/status/2034408765127053540',
        quote: "The *outcome* of this is a bifurcation. Crypto will fork. It will bifurcate into inside and outside. Then both will fail. Inside will fail bc it's not crypto, it's some digital token shared by a dozen or more companies and that will eventually be broken. Outside will be small, and will be hunted and eventually exterminated like the pest that it is.",
        attribution: { author: '@iang', date: 'Dec 25', domain: 'x.com' },
    },
    {
        name: 'Continuations — math-heavy quote',
        url: 'https://continuations.com/more-lazy-employment-thinking-jevons-paradox-edition',
        quote: "Consider a 90% labor savings and now ask how much would units produced have to grow to at least offset this?\n\nX units produced 0.1 human labor / unit = 1 Total labor\n\nX = 1 / 0.1 = 10!\n\nSo at a 90% labor savings from AI you need a 10x demand growth to just break even on labor demand. For many products that's clearly not going to happen. On this ground alone we should reject a simplistic invocation of Jevons paradox.",
        attribution: { author: 'Albert Wenger', date: 'You-Tube', domain: 'continuations.com' },
    },
    {
        name: 'SwissInfo — article behind consent wall',
        url: 'https://www.swissinfo.ch/eng/research-frontiers/ig-nobels-to-move-awards-to-switzerland-due-to-concern-over-us-travel-visas/91073250',
        quote: "But four of the 10 winners last year chose not to travel to Boston for the ceremony. In previous years, the ceremony has taken place at Harvard University, Massachusetts Institute of Technology and Boston University.\n\nThe move comes amid Donald Trump's sweeping crackdown on immigration, in which he has focused on deporting migrants illegally in the US, as well as holders of student and visitor exchange visas.",
        attribution: { author: 'SwissInfo', date: '2-2', domain: 'swissinfo.ch' },
    },
    {
        name: 'Socket.dev — npm maintainer attacks',
        url: 'https://socket.dev/blog/attackers-hunting-high-impact-nodejs-maintainers',
        quote: 'axios was not a one-off target. It was part of a coordinated, scalable attack pattern aimed at high-trust, high-impact open source maintainers',
        attribution: { author: 'Socket Dev', date: '4/4/26', domain: 'socket.dev' },
    },
    {
        name: 'Sherlock xyz — crypto article',
        url: 'https://sherlock.xyz/post/institutional-crypto-adoption-in-2026-whos-actually-moving-in',
        quote: 'Institutional adoption is a balance sheet reality. $123.5 billion in Bitcoin ETF assets. $35.6 billion in tokenized real-world assets. Over $1 billion in daily on-chain settlement by a single bank. Sovereign wealth funds with billion-dollar Bitcoin positions. A consortium of the largest U.S. banks building a stablecoin. Visa and Mastercard running stablecoin settlement infrastructure. The question has shifted from "will institutions adopt crypto?" to "how fast will the infrastructure scale to meet institutional demand?"',
        attribution: { author: 'Sherlock', date: '2-20-2026', domain: 'sherlock.xyz' },
    },
];

describe('Screenshot E2E Integration', () => {
    afterAll(async () => {
        await shutdownPool();
    });

    it.each(TEST_CASES)('scrape + screenshot for $name', async ({ name, url, quote, attribution }) => {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });

        // Step 1: Scrape the article (full pipeline, real Puppeteer)
        const scrapeResult = await scrapeArticle(url);
        expect(scrapeResult).toHaveProperty('markdown');
        expect(scrapeResult).toHaveProperty('html');

        // Step 2: Capture screenshot using the LOCAL HTML path
        // For tweets (no html from scrape), fall back to live URL
        const articleHtml = scrapeResult.html || null;
        const buffer = await captureQuoteScreenshot(
            articleHtml,
            url,
            quote,
            attribution
        );

        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(5000);

        // Step 3: Save to disk for visual inspection
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const outputPath = path.join(OUTPUT_DIR, `${safeName}.png`);
        fs.writeFileSync(outputPath, buffer);

        console.log(`  ✓ ${name} → ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
    }, 120000);
});
