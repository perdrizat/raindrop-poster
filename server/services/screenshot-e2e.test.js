import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import puppeteer from 'puppeteer';
import { execSync } from 'node:child_process';
import { captureQuoteScreenshot } from './screenshotService.js';
import { scrapeArticle, shutdownPool } from './scraperService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Screenshot E2E Integration Tests — THE single screenshot regression suite.
 * (Merged from the former scripts/screenshot-test.sh + screenshot-test.mjs on
 * 2026-06-12; do not create a parallel screenshot test mechanism.)
 *
 * Exercises the FULL production pipeline on a curated set of problem URLs:
 *   1. Scrape the article via Puppeteer → { markdown, html }
 *   2. Pass the extracted HTML to captureQuoteScreenshot (local rendering path,
 *      with live-URL + archive fallbacks when the quote isn't found)
 *   3. Assert a plausible PNG came back
 *   4. Save a timestamped PNG to server/scripts/screenshots/ for visual inspection
 *
 * VISUAL VERIFICATION (the part assertions can't do):
 *   After the run, inspect the saved images (Claude Code can read them directly):
 *     (i)   The correct quote is highlighted in yellow — fully, and nothing else
 *     (ii)  No cookie banner / consent wall / overlay bleeding through
 *     (iii) Full page width visible, no truncated lines
 *     (iv)  Attribution bar present and correct at the bottom
 *
 * ADDING NEW TEST CASES: append to TEST_CASES below — one entry per URL that
 * ever failed in production, so regressions stay caught.
 *
 * Run with: pnpm test:e2e (repo root) or pnpm -C server test:e2e
 */

const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/screenshots');

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
    {
        name: 'Stratechery — Apple/Google Siri quote',
        url: 'https://stratechery.com/2026/tim-cooks-impeccable-timing/',
        quote: 'The new Siri still hasn’t launched, and when it does, it will be with Google’s technology at the core',
        attribution: { author: 'Ben Thompson', date: 'Apr 2026', domain: 'stratechery.com' },
    },
    {
        name: 'Vitalik eth.limo — formal verification AI quote',
        url: 'https://vitalik.eth.limo/general/2026/05/18/fv.html',
        quote: 'Formal verification, aided by AI, should be viewed not as totally new paradigm, but as a powerful accelerant of a trend and a paradigm that was already marching forward',
        attribution: { author: 'Vitalik Buterin', date: '2026-05-18', domain: 'vitalik.eth.limo' },
    },
    {
        name: 'Casa blog — social engineering active-call defense',
        url: 'https://blog.casa.io/evolving-casas-defenses-against-social-engineering/',
        quote: "20% of social engineering attacks start with an unexpected call. To protect against these attacks, the app now detects when you're on an active phone call and shows a warning before you send funds. The attacker needs you on the phone because urgency and real-time pressure can override careful thinking",
        attribution: { author: 'Team Casa', date: '2026-05-26', domain: 'blog.casa.io' },
    },
    {
        name: 'Bitcoin Magazine — Bitcoin-backed mortgage quote',
        url: 'https://bitcoinmagazine.com/news/bitcoin-buys-a-home-better-and-coinbase',
        quote: 'The structure involves two separate loans. Borrowers first receive a standard 15- or 30-year Fannie Mae-backed mortgage on the property itself. A second, privately financed loan — secured by pledged Bitcoin or USDC — covers the down payment. Both loans carry the same interest rate and term, consolidating into a single monthly payment',
        attribution: { author: 'Micah Zimmerman', date: '2026-06-10', domain: 'bitcoinmagazine.com' },
    },
];

// Timestamped filenames so runs accumulate in server/scripts/screenshots/
// without overwriting — the user compares captures across runs (CONTRIBUTING).
const timestamp = () => {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
};

// Turns a Chrome-launch failure into an actionable message. The two real causes
// on a fresh box: a missing binary (Node 24.16/24.17 silently mis-extract it —
// nodejs/node#63487) or missing system libraries (ldd enumerates those precisely).
function diagnoseBrowserLaunch(err) {
    const original = (err?.message || String(err)).split('\n')[0];
    let exe = '(unresolved)';
    try { exe = puppeteer.executablePath(); } catch { /* not resolvable */ }
    const installed = exe !== '(unresolved)' && fs.existsSync(exe);
    const out = [
        'E2E preflight: Chrome failed to launch — fix this before the suite can run.',
        `  executablePath: ${exe}`,
    ];
    if (!installed) {
        out.push(
            '  Chrome is not installed. Install under a pinned Node (<=24.15.0; 24.16/24.17 silently mis-extract — nodejs/node#63487):',
            '    rm -rf ~/.cache/puppeteer && pnpm -C server exec puppeteer browsers install chrome',
        );
    } else {
        out.push('  Chrome is installed but cannot launch — usually missing system libraries.');
        try {
            const ldd = execSync(`ldd "${exe}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            const missing = ldd.split('\n').filter((l) => l.includes('not found')).map((l) => l.trim());
            if (missing.length) out.push('  Missing libraries:', ...missing.map((l) => `    ${l}`));
        } catch { /* ldd unavailable (non-Linux) */ }
        out.push('  Install (Debian/Ubuntu): sudo apt-get install -y libnss3 libasound2   (libasound2t64 on Ubuntu 24.04+)');
    }
    out.push(`  Original error: ${original}`);
    out.push('  See CONTRIBUTING.md -> Build & Run (local Chrome / e2e).');
    return out.join('\n');
}

describe('Screenshot E2E Integration', () => {
    // Preflight: one fast launch so a missing browser/libs fails here with guidance,
    // instead of 12 x 30s pool-acquire timeouts (and a /tmp profile storm).
    beforeAll(async () => {
        let browser;
        try {
            browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        } catch (err) {
            throw new Error(diagnoseBrowserLaunch(err), { cause: err });
        } finally {
            await browser?.close().catch(() => {});
        }
    }, 60000);

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
        expect(buffer.length).toBeGreaterThan(10000);

        // Step 3: Save to disk for visual inspection
        const safeName = name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const outputPath = path.join(OUTPUT_DIR, `${timestamp()}_${safeName}.png`);
        fs.writeFileSync(outputPath, buffer);

        console.log(`  ✓ ${name} → ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
    }, 240000);
});
