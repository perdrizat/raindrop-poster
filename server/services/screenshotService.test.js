import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — define mocks inline, not as separate variables
vi.mock('./scraperService.js', () => {
    const mockPage = {
        goto: vi.fn().mockResolvedValue(),
        evaluate: vi.fn(),
        evaluateOnNewDocument: vi.fn().mockResolvedValue(),
        waitForNavigation: vi.fn().mockResolvedValue(),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
        setViewport: vi.fn().mockResolvedValue(),
        setUserAgent: vi.fn().mockResolvedValue(),
        close: vi.fn().mockResolvedValue(),
        setRequestInterception: vi.fn().mockResolvedValue(),
        on: vi.fn(),
    };
    const mockBrowser = {
        newPage: vi.fn().mockResolvedValue(mockPage),
        connected: true,
    };
    return {
        acquireBrowser: vi.fn().mockResolvedValue(mockBrowser),
        releaseBrowser: vi.fn().mockResolvedValue(),
        __mockPage: mockPage,
        __mockBrowser: mockBrowser,
    };
});

import { captureQuoteScreenshot, formatAttribution, computeClip } from './screenshotService.js';
import { __mockPage as mockPage } from './scraperService.js';

describe('screenshotService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPage.goto.mockResolvedValue();
        mockPage.evaluate.mockReset();
        mockPage.screenshot.mockResolvedValue(Buffer.from('fake-png'));
        mockPage.setViewport.mockResolvedValue();
        mockPage.setUserAgent.mockResolvedValue();
        mockPage.close.mockResolvedValue();
    });

    it('should navigate to URL and take screenshot when quote is found', async () => {
        mockPage.evaluate
            .mockResolvedValueOnce({ found: true, rect: { x: 50, y: 200, width: 600, height: 100 } }) // findQuoteInDOM
            .mockResolvedValueOnce(5000)   // scrollHeight
            .mockResolvedValueOnce(undefined); // attribution bar

        const result = await captureQuoteScreenshot(
            null,
            'https://example.com/article',
            'Some important quote text',
            { author: 'Jane Smith', date: '2026-02-27', domain: 'example.com' }
        );

        expect(mockPage.goto).toHaveBeenCalledWith(
            'https://example.com/article',
            expect.objectContaining({ waitUntil: 'networkidle2' })
        );
        expect(mockPage.setViewport).toHaveBeenCalledWith(
            expect.objectContaining({
                width: 390,
                height: 8000,
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 2,
            })
        );

        expect(result).toBeInstanceOf(Buffer);
        expect(mockPage.screenshot).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'png' })
        );
    });

    it('should intercept x.com URLs and redirect to vxtwitter.com to bypass login walls', async () => {
        mockPage.evaluate
            .mockResolvedValueOnce({ found: false, rect: null }) // findQuoteInDOM (vxtwitter — no Wayback fallback)
            .mockResolvedValueOnce(5000)   // scrollHeight
            .mockResolvedValueOnce(undefined); // attribution bar injection

        const result = await captureQuoteScreenshot(
            null,
            'https://x.com/jack/status/2027129697092731343?s=20',
            'Some quote text',
            { author: 'Jane Smith', date: '2026-02-27', domain: 'x.com' }
        );

        expect(mockPage.goto).toHaveBeenCalledWith(
            'https://vxtwitter.com/jack/status/2027129697092731343',
            expect.objectContaining({ waitUntil: 'networkidle2' })
        );
        expect(result).toBeInstanceOf(Buffer);
    });

    it('should return buffer when quote not found (fallback to title area)', async () => {
        mockPage.evaluate
            .mockResolvedValueOnce({ found: false, rect: null }) // findQuoteInDOM — live site, not found
            .mockResolvedValueOnce({ found: false, rect: null }) // findQuoteInDOM — archive.ph fallback, not found
            .mockResolvedValueOnce({ found: false, rect: null }) // findQuoteInDOM — Wayback fallback, not found
            .mockResolvedValueOnce(5000)   // scrollHeight
            .mockResolvedValueOnce(undefined); // attribution bar injection

        const result = await captureQuoteScreenshot(
            null,
            'https://example.com/article',
            'Nonexistent quote text',
            { author: 'Jane Smith', date: '2026-02-27', domain: 'example.com' }
        );

        expect(result).toBeInstanceOf(Buffer);
    });

    it('should use cover image URL directly when no quote and cover exists', async () => {
        const result = await captureQuoteScreenshot(
            null,
            'https://example.com/article',
            null,
            { author: 'Jane Smith', date: '2026-02-27', domain: 'example.com' },
            'https://example.com/cover.jpg'
        );

        expect(result).toBe('https://example.com/cover.jpg');
        expect(mockPage.goto).not.toHaveBeenCalled();
    });

    it('should throw on navigation failure', async () => {
        mockPage.goto.mockRejectedValueOnce(new Error('Timeout'));

        await expect(captureQuoteScreenshot(
            null,
            'https://bad-url.example.com',
            'Some quote',
            { author: 'Author', date: '2026-01-01', domain: 'example.com' }
        )).rejects.toThrow('Failed to capture screenshot');
    });

    it('should fall back to live URL when quote not found in local HTML', async () => {
        mockPage.setContent = vi.fn().mockResolvedValue();
        mockPage.evaluate
            .mockResolvedValueOnce(5000)   // initialScrollHeight (before findQuoteInDOM)
            .mockResolvedValueOnce({ found: false, rect: null }) // findQuoteInDOM on local HTML — not found
            .mockResolvedValueOnce({ found: true, rect: { x: 50, y: 200, width: 600, height: 100 } }) // findQuoteInDOM on live URL — found
            .mockResolvedValueOnce(5000)   // pageHeight
            .mockResolvedValueOnce(undefined); // attribution bar

        const result = await captureQuoteScreenshot(
            '<p>No matching quote here</p>',
            'https://example.com/article',
            'Some important quote text',
            { author: 'Jane Smith', date: '2026-02-27', domain: 'example.com' }
        );

        // Should have tried local HTML first, then fallen back to goto
        expect(mockPage.setContent).toHaveBeenCalled();
        expect(mockPage.goto).toHaveBeenCalledWith(
            'https://example.com/article',
            expect.objectContaining({ waitUntil: 'networkidle2' })
        );
        expect(result).toBeInstanceOf(Buffer);
    });

    it('should render local HTML via setContent when articleHtml is provided', async () => {
        mockPage.setContent = vi.fn().mockResolvedValue();
        mockPage.evaluate
            .mockResolvedValueOnce(5000)   // initialScrollHeight (before findQuoteInDOM)
            .mockResolvedValueOnce({ found: true, rect: { x: 50, y: 200, width: 600, height: 100 } }) // findQuoteInDOM
            .mockResolvedValueOnce(5000)   // pageHeight
            .mockResolvedValueOnce(undefined); // attribution bar

        const articleHtml = '<h1>Test Article</h1><p>Some important quote text here.</p>';
        const result = await captureQuoteScreenshot(
            articleHtml,
            'https://example.com/article',
            'Some important quote text',
            { author: 'Jane Smith', date: '2026-02-27', domain: 'example.com' }
        );

        // Should use setContent instead of goto
        expect(mockPage.setContent).toHaveBeenCalled();
        expect(mockPage.goto).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(Buffer);
    });
});

describe('computeClip', () => {
    const VIEWPORT_WIDTH = 390;
    const PAGE_HEIGHT = 5000;

    it('always sets x=0 and size=viewportWidth when quote is found, regardless of rect position', () => {
        const foundResult = { found: true, rect: { x: 80, y: 400, width: 180, height: 60 } };
        const clip = computeClip(foundResult, VIEWPORT_WIDTH, PAGE_HEIGHT);
        expect(clip.x).toBe(0);
        expect(clip.size).toBe(VIEWPORT_WIDTH);
    });

    it('derives y from rect.y with padding subtracted', () => {
        const foundResult = { found: true, rect: { x: 0, y: 500, width: 390, height: 60 } };
        const clip = computeClip(foundResult, VIEWPORT_WIDTH, PAGE_HEIGHT);
        // y should be rect.y minus padding (30), clamped to 0
        expect(clip.y).toBe(500 - 30);
    });

    it('clamps y to 0 when rect.y is less than padding', () => {
        const foundResult = { found: true, rect: { x: 0, y: 10, width: 390, height: 60 } };
        const clip = computeClip(foundResult, VIEWPORT_WIDTH, PAGE_HEIGHT);
        expect(clip.y).toBe(0);
    });

    it('height is at least as large as size (square crop)', () => {
        const foundResult = { found: true, rect: { x: 0, y: 200, width: 390, height: 20 } };
        const clip = computeClip(foundResult, VIEWPORT_WIDTH, PAGE_HEIGHT);
        expect(clip.height).toBeGreaterThanOrEqual(clip.size);
    });

    it('height expands to fit a tall quote', () => {
        const foundResult = { found: true, rect: { x: 0, y: 200, width: 390, height: 800 } };
        const clip = computeClip(foundResult, VIEWPORT_WIDTH, PAGE_HEIGHT);
        expect(clip.height).toBeGreaterThan(VIEWPORT_WIDTH);
        expect(clip.height).toBeGreaterThanOrEqual(800 + 60); // height + 2*padding
    });

    it('totalHeight includes barHeight', () => {
        const foundResult = { found: true, rect: { x: 0, y: 200, width: 390, height: 60 } };
        const clip = computeClip(foundResult, VIEWPORT_WIDTH, PAGE_HEIGHT);
        expect(clip.totalHeight).toBe(clip.height + clip.barHeight);
        expect(clip.barHeight).toBe(40);
    });

    it('falls back to full viewport size when quote not found', () => {
        const clip = computeClip({ found: false, rect: null }, VIEWPORT_WIDTH, PAGE_HEIGHT);
        expect(clip.x).toBe(0);
        expect(clip.size).toBe(VIEWPORT_WIDTH);
    });
});

describe('formatAttribution', () => {
    it('should format with all fields', () => {
        const result = formatAttribution({
            author: 'Jane Smith',
            date: '2026-02-27',
            domain: 'wired.com',
        });
        expect(result).toContain('✍');
        expect(result).toContain('Jane Smith');
        expect(result).toContain('2026');
        expect(result).toContain('wired.com');
    });

    it('should handle missing author', () => {
        const result = formatAttribution({
            author: null,
            date: '2026-02-27',
            domain: 'wired.com',
        });
        expect(result).toContain('✍');
        expect(result).not.toContain('null');
        expect(result).toContain('wired.com');
    });

    it('should handle missing date', () => {
        const result = formatAttribution({
            author: 'Jane',
            date: null,
            domain: 'wired.com',
        });
        expect(result).toContain('Jane');
        expect(result).toContain('wired.com');
    });

    it('should not render the literal string "null" when LLM returns it as author', () => {
        const result = formatAttribution({
            author: 'null',
            date: '2026-02-27',
            domain: 'wired.com',
        });
        expect(result).not.toMatch(/\bnull\b/i);
        expect(result).toContain('wired.com');
    });

    it('should not render "undefined" as author or domain', () => {
        const result = formatAttribution({
            author: 'undefined',
            date: null,
            domain: 'undefined',
        });
        expect(result).not.toMatch(/\bundefined\b/i);
    });

    it('should parse dotted dates day-first (German locale: 9.6.2026 = June, not September)', () => {
        const result = formatAttribution({
            author: 'Jane',
            date: '9.6.2026',
            domain: 'example.com',
        });
        expect(result).toContain('Jun 2026');
        expect(result).not.toContain('Sep');
    });

    it('should parse dotted dates with two-digit day and month (24.12.2026 = December)', () => {
        const result = formatAttribution({
            author: 'Jane',
            date: '24.12.2026',
            domain: 'example.com',
        });
        expect(result).toContain('Dec 2026');
    });

    it('should still parse US slash dates month-first (6/9/2026 = June)', () => {
        const result = formatAttribution({
            author: 'Jane',
            date: '6/9/2026',
            domain: 'example.com',
        });
        expect(result).toContain('Jun 2026');
    });

    it('should parse ISO dates (YYYY-MM-DD) as calendar dates, immune to timezone shift', () => {
        // new Date('2026-06-01') is UTC midnight; in a UTC-negative timezone the local
        // rendering would shift to "May 2026". ISO dates must be treated as plain
        // calendar dates, not instants.
        const prevTz = process.env.TZ;
        process.env.TZ = 'America/New_York';
        try {
            const result = formatAttribution({
                author: 'Jane',
                date: '2026-06-01',
                domain: 'example.com',
            });
            expect(result).toContain('Jun 2026');
            expect(result).not.toContain('May');
        } finally {
            process.env.TZ = prevTz;
        }
    });

    it('should skip the date segment entirely when it cannot be parsed', () => {
        const result = formatAttribution({
            author: 'Albert Wenger',
            date: 'You-Tube',
            domain: 'continuations.com',
        });
        expect(result).not.toMatch(/invalid date/i);
        expect(result).not.toMatch(/NaN/);
        expect(result).toContain('Albert Wenger');
        expect(result).toContain('continuations.com');
    });
});
