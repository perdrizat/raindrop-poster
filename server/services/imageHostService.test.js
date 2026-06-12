import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the S3 client
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
    const MockS3Client = function () { this.send = mockSend; };
    return {
        S3Client: MockS3Client,
        PutObjectCommand: function (params) { Object.assign(this, params); },
        DeleteObjectCommand: function (params) { Object.assign(this, params); },
        ListObjectsV2Command: function (params) { Object.assign(this, params); },
    };
});

vi.mock('./db.js', () => {
    const getSetting = vi.fn();
    return {
        getSetting,
        // Mirror the real precedence: env wins, programmed getSetting is the fallback
        getConfig: vi.fn().mockImplementation(async (k) => process.env[k] || getSetting(k)),
    };
});

import { getSetting } from './db.js';

describe('imageHostService (R2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Set up R2 env vars
        process.env.R2_ACCOUNT_ID = 'test-account';
        process.env.R2_ACCESS_KEY_ID = 'test-key';
        process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
        process.env.R2_BUCKET_NAME = 'test-bucket';
        process.env.R2_PUBLIC_URL = 'https://test-bucket.test-account.r2.dev';
    });

    it('should upload a PNG buffer and return a public URL with a unique key', async () => {
        mockSend.mockResolvedValueOnce({});

        const { uploadImage } = await import('./imageHostService.js');
        const pngBuffer = Buffer.from('fake-png-data');
        const result = await uploadImage(pngBuffer);

        expect(result.url).toMatch(/^https:\/\/test-bucket\.test-account\.r2\.dev\/.+\.png$/);
        expect(result.key).toMatch(/\.png$/);
        expect(mockSend).toHaveBeenCalledTimes(1);

        const sentCommand = mockSend.mock.calls[0][0];
        expect(sentCommand.Bucket).toBe('test-bucket');
        expect(sentCommand.ContentType).toBe('image/png');
        expect(sentCommand.Body).toEqual(pngBuffer);
    });

    it('should delete an image by key', async () => {
        mockSend.mockResolvedValueOnce({});

        const { deleteImage } = await import('./imageHostService.js');
        await deleteImage('screenshots/abc123.png');

        expect(mockSend).toHaveBeenCalledTimes(1);
        const sentCommand = mockSend.mock.calls[0][0];
        expect(sentCommand.Bucket).toBe('test-bucket');
        expect(sentCommand.Key).toBe('screenshots/abc123.png');
    });

    it('should throw if R2 credentials are not configured', async () => {
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.R2_BUCKET_NAME;
        delete process.env.R2_PUBLIC_URL;
        getSetting.mockResolvedValue(null);

        const { uploadImage } = await import('./imageHostService.js');

        await expect(uploadImage(Buffer.from('data')))
            .rejects.toThrow(/R2.*not configured/i);
    });

    it('should throw on S3 upload error', async () => {
        mockSend.mockRejectedValueOnce(new Error('S3 network error'));

        const { uploadImage } = await import('./imageHostService.js');

        await expect(uploadImage(Buffer.from('data')))
            .rejects.toThrow('Failed to upload image');
    });

    it('should test R2 connectivity and return object count and last upload date', async () => {
        mockSend.mockResolvedValueOnce({
            KeyCount: 42,
            Contents: [
                { Key: 'screenshots/old.png', LastModified: new Date('2026-03-01T10:00:00Z') },
                { Key: 'screenshots/newest.png', LastModified: new Date('2026-03-28T15:30:00Z') },
            ],
        });

        const { testConnection } = await import('./imageHostService.js');
        const result = await testConnection();

        expect(result.success).toBe(true);
        expect(result.objectCount).toBe(42);
        expect(result.lastUpload).toBe('2026-03-28T15:30:00.000Z');
        expect(result.message).toMatch(/42 images/);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle empty R2 bucket in testConnection', async () => {
        mockSend.mockResolvedValueOnce({
            KeyCount: 0,
            Contents: [],
        });

        const { testConnection } = await import('./imageHostService.js');
        const result = await testConnection();

        expect(result.success).toBe(true);
        expect(result.objectCount).toBe(0);
        expect(result.lastUpload).toBeNull();
        expect(result.message).toMatch(/0 images/);
    });

    it('should fall back to DB settings when env vars are missing', async () => {
        delete process.env.R2_ACCOUNT_ID;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.R2_BUCKET_NAME;
        delete process.env.R2_PUBLIC_URL;

        getSetting.mockImplementation(async (key) => {
            const map = {
                R2_ACCOUNT_ID: 'db-account',
                R2_ACCESS_KEY_ID: 'db-key',
                R2_SECRET_ACCESS_KEY: 'db-secret',
                R2_BUCKET_NAME: 'db-bucket',
                R2_PUBLIC_URL: 'https://db-bucket.db-account.r2.dev',
            };
            return map[key] || null;
        });

        mockSend.mockResolvedValueOnce({});

        const { uploadImage } = await import('./imageHostService.js');
        const result = await uploadImage(Buffer.from('data'));

        expect(result.url).toMatch(/^https:\/\/db-bucket\.db-account\.r2\.dev\//);
    });
});
