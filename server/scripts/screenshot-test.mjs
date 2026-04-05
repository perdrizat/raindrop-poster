#!/usr/bin/env node
/**
 * screenshot-test.mjs — standalone screenshot capture & R2 upload script.
 *
 * Runs the full production screenshot pipeline (real Puppeteer + dismissPopups +
 * Wayback Machine fallback) on a curated set of "problem URLs", uploads each
 * result to Cloudflare R2, and prints the public URLs.
 *
 * This script is meant to be invoked by scripts/screenshot-test.sh, which
 * also downloads the images to /tmp for local inspection.
 *
 * Usage (direct):
 *   node server/scripts/screenshot-test.mjs
 *
 * Usage (via shell wrapper — recommended):
 *   ./scripts/screenshot-test.sh
 *
 * Required:
 *   Cloudflare R2 credentials — set via the app Setup page (SQLite) or as env vars.
 *
 * Output format (stdout):
 *   Progress lines are prefixed with "#" so the shell wrapper can skip them.
 *   Each successful upload prints:  IMG <tab> <name> <tab> <url>
 *   Each failure prints:            ERR <tab> <name> <tab> <message>
 *
 * HOW TO VERIFY THE GENERATED SCREENSHOTS
 * ----------------------------------------
 * Open each downloaded image (or R2 URL) and check:
 *
 *   (i)  CORRECT QUOTE HIGHLIGHTED
 *        The text matching the expected quote (see TEST_CASES below) must be
 *        covered by a semi-transparent yellow highlight (~rgba 255,235,59 at
 *        40% opacity). Verify the highlighted words match the START and END
 *        of the expected quote — not just nearby text.
 *
 *   (ii) NOTHING ELSE HIGHLIGHTED
 *        Only the expected quote should be yellow. If a preceding tweet, a
 *        heading, or unrelated paragraph is also highlighted, the fuzzy
 *        matcher scored the wrong region — raise the match threshold or
 *        check the per-article search logic in services/highlighter.js.
 *
 *   (iii) NO OVERLAY
 *        No cookie banner, consent dialog, paywall, or dark modal should be
 *        visible. If only the site header / nav / article title appears (no
 *        article body), the consent wall was not dismissed. Check
 *        dismissPopups() in services/screenshotService.js, or verify that
 *        the Wayback Machine fallback loaded the archived version.
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

import { captureQuoteScreenshot } from '../services/screenshotService.js';
import { uploadImage } from '../services/imageHostService.js';
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
        attribution: { author: "@iang", date: "Dec 25" domain: 'x.com' },
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

            const { url: imageUrl } = await uploadImage(buffer);
            log(`    ✓ uploaded (${(buffer.length / 1024).toFixed(0)} KB) → ${imageUrl}`);
            // Parseable line read by the shell script
            process.stdout.write(`IMG\t${name}\t${imageUrl}\n`);
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
