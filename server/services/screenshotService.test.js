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

import { captureQuoteScreenshot, formatAttribution } from './screenshotService.js';
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
            .mockResolvedValueOnce({ found: true, rect: { x: 50, y: 200, width: 600, height: 100 } })
            .mockResolvedValueOnce({ x: 0, y: 100, size: 700, totalHeight: 740, barHeight: 40 })
            .mockResolvedValueOnce(undefined);

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
            .mockResolvedValueOnce({ x: 0, y: 0, size: 700, totalHeight: 740, barHeight: 40 }) // clip calc
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
            .mockResolvedValueOnce({ x: 0, y: 0, size: 700, totalHeight: 740, barHeight: 40 }) // clip calc
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
            .mockResolvedValueOnce({ found: false, rect: null }) // findQuoteInDOM on local HTML — not found
            .mockResolvedValueOnce({ found: true, rect: { x: 50, y: 200, width: 600, height: 100 } }) // findQuoteInDOM on live URL — found
            .mockResolvedValueOnce({ x: 0, y: 100, size: 700, totalHeight: 740, barHeight: 40 }) // clip calc
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
            .mockResolvedValueOnce({ found: true, rect: { x: 50, y: 200, width: 600, height: 100 } })
            .mockResolvedValueOnce({ x: 0, y: 100, size: 700, totalHeight: 740, barHeight: 40 })
            .mockResolvedValueOnce(undefined);

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
});
