import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resizeImage } from './imageUtils';

describe('resizeImage', () => {
    let mockCanvas;
    let mockCtx;

    beforeEach(() => {
        mockCtx = {
            drawImage: vi.fn(),
        };
        mockCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn(() => mockCtx),
            toDataURL: vi.fn(() => 'data:image/png;base64,resized'),
        };

        vi.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') return mockCanvas;
            return document.createElement(tag);
        });
    });

    const createMockImage = (width, height) => {
        // Mock globalThis.Image to simulate loading
        const originalImage = globalThis.Image;
        globalThis.Image = class {
            constructor() {
                setTimeout(() => {
                    this.naturalWidth = width;
                    this.naturalHeight = height;
                    this.onload?.();
                }, 0);
            }
        };
        return () => { globalThis.Image = originalImage; };
    };

    it('should resize a landscape image exceeding 1024px on the long side', async () => {
        const restore = createMockImage(2048, 1024);

        const result = await resizeImage('data:image/png;base64,original');

        expect(mockCanvas.width).toBe(1024);
        expect(mockCanvas.height).toBe(512);
        expect(mockCtx.drawImage).toHaveBeenCalled();
        expect(result).toBe('data:image/png;base64,resized');

        restore();
    });

    it('should resize a portrait image exceeding 1024px on the long side', async () => {
        const restore = createMockImage(768, 2048);

        const result = await resizeImage('data:image/png;base64,original');

        expect(mockCanvas.width).toBe(384);
        expect(mockCanvas.height).toBe(1024);
        expect(mockCtx.drawImage).toHaveBeenCalled();
        expect(result).toBe('data:image/png;base64,resized');

        restore();
    });

    it('should return original if already within max bounds', async () => {
        const restore = createMockImage(800, 600);

        const result = await resizeImage('data:image/png;base64,original');

        // Should not draw to canvas at all
        expect(mockCtx.drawImage).not.toHaveBeenCalled();
        expect(result).toBe('data:image/png;base64,original');

        restore();
    });

    it('should handle square images at exactly 1024px', async () => {
        const restore = createMockImage(1024, 1024);

        const result = await resizeImage('data:image/png;base64,original');

        expect(mockCtx.drawImage).not.toHaveBeenCalled();
        expect(result).toBe('data:image/png;base64,original');

        restore();
    });

    it('should accept a custom maxSide parameter', async () => {
        const restore = createMockImage(1000, 500);

        const result = await resizeImage('data:image/png;base64,original', 512);

        expect(mockCanvas.width).toBe(512);
        expect(mockCanvas.height).toBe(256);
        expect(mockCtx.drawImage).toHaveBeenCalled();
        expect(result).toBe('data:image/png;base64,resized');

        restore();
    });
});
