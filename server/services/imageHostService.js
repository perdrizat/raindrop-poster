import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { getConfig } from './db.js';

/**
 * Resolves R2 configuration from env vars or DB settings.
 */
async function getR2Config() {
    const accountId = await getConfig('R2_ACCOUNT_ID');
    const accessKeyId = await getConfig('R2_ACCESS_KEY_ID');
    const secretAccessKey = await getConfig('R2_SECRET_ACCESS_KEY');
    const bucket = await getConfig('R2_BUCKET_NAME');
    const publicUrl = await getConfig('R2_PUBLIC_URL');

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
        throw new Error('Cloudflare R2 is not configured. Please add R2 credentials in Settings.');
    }

    return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

/**
 * Resolves R2 config and an S3-compatible client for it. Not cached: credentials
 * can change at runtime via Settings, so every operation reads the current config.
 */
async function getR2() {
    const config = await getR2Config();
    const client = new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
    return { config, client };
}

/**
 * Uploads a PNG buffer to Cloudflare R2 and returns the public URL and key.
 * @param {Buffer} pngBuffer - The image data as a Buffer
 * @returns {Promise<{url: string, key: string}>} The public URL and R2 object key
 */
export const uploadImage = async (pngBuffer) => {
    const { config, client } = await getR2();

    const key = `screenshots/${crypto.randomUUID()}.png`;

    try {
        console.log(`R2 → PUT ${key} (${Math.round(pngBuffer.length / 1024)}KB)`);
        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: pngBuffer,
            ContentType: 'image/png',
        }));

        const publicUrl = config.publicUrl.replace(/\/$/, '');
        const url = `${publicUrl}/${key}`;

        console.log(`R2 ✓ ${url}`);
        return { url, key };
    } catch (error) {
        console.error('R2 upload error:', error.message);
        throw new Error('Failed to upload image');
    }
};

/**
 * Deletes an image from Cloudflare R2 by key.
 * @param {string} key - The R2 object key to delete
 */
export const deleteImage = async (key) => {
    const { config, client } = await getR2();

    console.log(`R2 → DELETE ${key}`);
    await client.send(new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
    }));
    console.log(`R2 ✓ deleted ${key}`);
};

/**
 * Tests R2 connectivity by checking if the bucket exists.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const testConnection = async () => {
    const { config, client } = await getR2();

    const response = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: 'screenshots/',
    }));

    const objectCount = response.KeyCount || 0;
    const contents = response.Contents || [];
    let lastUpload = null;

    if (contents.length > 0) {
        const newest = contents.reduce((a, b) => a.LastModified > b.LastModified ? a : b);
        lastUpload = newest.LastModified.toISOString();
    }

    return {
        success: true,
        objectCount,
        lastUpload,
        message: `Connected to R2 bucket "${config.bucket}" — ${objectCount} images stored`,
    };
};
