#!/usr/bin/env node
/**
 * screenshot-test.mjs — standalone screenshot capture test script.
 *
 * The mission of this test is to verify that the screenshot was created correctly:
 *   - identified the quote
 *   - highlighted the quote fully but not more
 *   - the full article page breadth is shown (no article lines cut off left or right)
 *   - no elements overlaying the screen, such as cookie banners, subscription nags or ads
 *
 * This runs the screenshot pipeline (real Puppeteer + dismissPopups +
 * Wayback Machine fallback) on a curated set of "problem URLs" and saves
 * the resulting images locally to /tmp/raindrop-screenshots/.
 * This is NOT an end-to-end test of the screenshotting function (no R2 upload).
 *
 * This script is meant to be invoked by scripts/screenshot-test.sh.
 *
 * Output format (stdout):
 *   Progress lines are prefixed with "#" so the shell wrapper can skip them.
 *   Each successful capture prints: IMG <tab> <name> <tab> <path>
 *   Each failure prints:            ERR <tab> <name> <tab> <message>
 *
 * KNOWN FIXED ISSUES (as of 2026-03-22)
 *   - SwissInfo: previously failed due to consent wall; now falls back to
 *     Wayback Machine automatically when the quote is not found.
 *   - X / vxtwitter threads: previously over-matched into preceding tweets;
 *     fixed by per-article search in highlighter.js.
 *
 * ADDING NEW TEST CASES
 *   Append to TEST_CASES below. Fields:
 *     name        — label shown in output and used as the downloaded filename
 *     url         — article / tweet URL
 *     quote       — exact passage that should be highlighted
 *     attribution — { author, date, domain } for the dark bar at the bottom
 */

import fs from 'fs/promises';
import path from 'path';
import { captureQuoteScreenshot } from '../services/screenshotService.js';
import { scrapeArticle, shutdownPool } from '../services/scraperService.js';

// Enable the full production code path: 8 s wait + dismissPopups + Wayback fallback.
process.env.NODE_ENV = 'e2e';

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
const TEST_CASES = [
    {
        name: 'SlowMist Medium — multi-paragraph quote',
        url: 'https://slowmist.medium.com/the-cat-and-mouse-dilemma-of-vasps-under-compliance-pressure-1255780f65da',
        quote: 'Infrastructure Seizures: Garantex had its servers shut down and faced criminal charges in a joint operation by the United States and Europe.\nComprehensive Sanctions and Blacklisting: Payeer was placed on the EU sanctions list, prohibiting any entity within the European Union from transacting with it.\nOperational Bans: India directly blocked more than 20 platforms, including BingX, LBank, and Poloniex.',
        attribution: { author: "SlowMist", date: "3-25", domain: 'slowmist.medium.com' },
    },
    {
        name: 'X vxtwitter — tweet thread',
        url: 'https://x.com/iang_fc/status/2034408765127053540',
        quote: "The *outcome* of this is a bifurcation. Crypto will fork. It will bifurcate into inside and outside. Then both will fail. Inside will fail bc it's not crypto, it's some digital token shared by a dozen or more companies and that will eventually be broken. Outside will be small, and will be hunted and eventually exterminated like the pest that it is.",
        attribution: { author: "@iang", date: "Dec 25", domain: 'x.com' },
    },
    {
        name: 'Continuations — math-heavy quote',
        url: 'https://continuations.com/more-lazy-employment-thinking-jevons-paradox-edition',
        quote: "Consider a 90% labor savings and now ask how much would units produced have to grow to at least offset this?\n\nX units produced 0.1 human labor / unit = 1 Total labor\n\nX = 1 / 0.1 = 10!\n\nSo at a 90% labor savings from AI you need a 10x demand growth to just break even on labor demand. For many products that's clearly not going to happen. On this ground alone we should reject a simplistic invocation of Jevons paradox.",
        attribution: { author: 'Albert Wenger', date: "You-Tube", domain: 'continuations.com' },
    },
    {
        name: 'SwissInfo — article behind consent wall',
        url: 'https://www.swissinfo.ch/eng/research-frontiers/ig-nobels-to-move-awards-to-switzerland-due-to-concern-over-us-travel-visas/91073250',
        quote: "But four of the 10 winners last year chose not to travel to Boston for the ceremony. In previous years, the ceremony has taken place at Harvard University, Massachusetts Institute of Technology and Boston University.\n\nThe move comes amid Donald Trump's sweeping crackdown on immigration, in which he has focused on deporting migrants illegally in the US, as well as holders of student and visitor exchange visas.",
        attribution: { author: "SwissInfo", date: "2-2", domain: 'swissinfo.ch' },
    },
    {
        name: 'Socket.dev — npm maintainer attacks',
        url: 'https://socket.dev/blog/attackers-hunting-high-impact-nodejs-maintainers',
        quote: 'axios was not a one-off target. It was part of a coordinated, scalable attack pattern aimed at high-trust, high-impact open source maintainers',
        attribution: { author: "Socket Dev", date: "4/4/26", domain: 'socket.dev' },
    },
    {
        name: 'Sherlock xyz — crypto article',
        url: 'https://sherlock.xyz/post/institutional-crypto-adoption-in-2026-whos-actually-moving-in',
        quote: 'Institutional adoption is a balance sheet reality. $123.5 billion in Bitcoin ETF assets. $35.6 billion in tokenized real-world assets. Over $1 billion in daily on-chain settlement by a single bank. Sovereign wealth funds with billion-dollar Bitcoin positions. A consortium of the largest U.S. banks building a stablecoin. Visa and Mastercard running stablecoin settlement infrastructure. The question has shifted from "will institutions adopt crypto?" to "how fast will the infrastructure scale to meet institutional demand?"',
        attribution: { author: "Sherlock", date: "2-20-2026", domain: 'sherlock.xyz' },
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
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg) { process.stderr.write(msg + '\n'); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    log(`\nRunning ${TEST_CASES.length} screenshot tests...\n`);

    for (const { name, url, quote, attribution } of TEST_CASES) {
        log(`  ▶ ${name}`);
        try {
            // Scrape first, then screenshot with local HTML
            log(`    scraping...`);
            let articleHtml = null;
            try {
                const scrapeResult = await scrapeArticle(url);
                articleHtml = scrapeResult.html || null;
                log(`    scraped (${(scrapeResult.markdown?.length || 0)} chars markdown)`);
            } catch (e) {
                log(`    scrape failed, falling back to live URL: ${e.message}`);
            }

            const buffer = await captureQuoteScreenshot(articleHtml, url, quote, attribution);

            if (!Buffer.isBuffer(buffer) || buffer.length < 10000) {
                throw new Error(`Buffer too small (${Buffer.isBuffer(buffer) ? buffer.length : typeof buffer} bytes)`);
            }

            const now = new Date();
            const datetime = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
            const safeName = `${datetime}_${name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
            const outputDir = path.join(path.dirname(new URL(import.meta.url).pathname), 'screenshots');
            await fs.mkdir(outputDir, { recursive: true });
            const outputPath = path.join(outputDir, `${safeName}.png`);
            await fs.writeFile(outputPath, buffer);

            log(`    ✓ saved (${(buffer.length / 1024).toFixed(0)} KB) → ${outputPath}`);
            // Parseable line read by the shell script
            process.stdout.write(`IMG\t${name}\t${outputPath}\n`);
        } catch (err) {
            log(`    ✗ ${err.message}`);
            process.stdout.write(`ERR\t${name}\t${err.message}\n`);
        }
    }

    log('\nShutting down browser pool...');
    await shutdownPool();
    log('Done.\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
