import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, getSetting, setSetting, getConfig, closeDb, trackPostImage, getUncleanedImages, removePostImage } from './db.js';
import fs from 'fs';
import path from 'path';

describe('Database Service', () => {
    const TEST_DB = path.join(process.cwd(), 'test-raindrop.sqlite');

    beforeEach(async () => {
        await closeDb();
        if (fs.existsSync(TEST_DB)) {
            fs.unlinkSync(TEST_DB);
        }
    });

    afterEach(async () => {
        try {
            await closeDb();
            if (fs.existsSync(TEST_DB)) {
                fs.unlinkSync(TEST_DB);
            }
        } catch (e) {
            // ignore
        }
    });

    it('should initialize the database and create the Settings table', async () => {
        const db = getDb(TEST_DB);
        // give the init time to happen before verifying
        await new Promise(r => setTimeout(r, 50));
        expect(db).toBeDefined();
    });

    it('should save and retrieve a setting', async () => {
        getDb(TEST_DB);
        await setSetting('test_key', 'test_value');
        const value = await getSetting('test_key');
        expect(value).toBe('test_value');
    });

    it('should update an existing setting', async () => {
        getDb(TEST_DB);
        await setSetting('test_key', 'initial_value');
        await setSetting('test_key', 'updated_value');
        const value = await getSetting('test_key');
        expect(value).toBe('updated_value');
    });

    it('should return null for non-existent setting', async () => {
        getDb(TEST_DB);
        const value = await getSetting('missing_key');
        expect(value).toBeNull();
    });

    // --- getConfig: env precedence over SQLite ---

    it('getConfig prefers process.env over the stored setting', async () => {
        getDb(TEST_DB);
        await setSetting('MY_CONF_KEY', 'from-db');
        process.env.MY_CONF_KEY = 'from-env';
        try {
            expect(await getConfig('MY_CONF_KEY')).toBe('from-env');
        } finally {
            delete process.env.MY_CONF_KEY;
        }
    });

    it('getConfig falls back to the stored setting when env is unset', async () => {
        getDb(TEST_DB);
        await setSetting('MY_CONF_KEY', 'from-db');
        delete process.env.MY_CONF_KEY;
        expect(await getConfig('MY_CONF_KEY')).toBe('from-db');
    });

    it('getConfig returns null when neither env nor setting exists', async () => {
        getDb(TEST_DB);
        delete process.env.NOWHERE_KEY;
        expect(await getConfig('NOWHERE_KEY')).toBeNull();
    });

    // --- post_images table ---

    it('should track a post image and retrieve it', async () => {
        getDb(TEST_DB);
        await new Promise(r => setTimeout(r, 50));

        await trackPostImage('post-1', 'screenshots/abc.png', 'channel-1');
        const images = await getUncleanedImages();

        expect(images).toHaveLength(1);
        expect(images[0].post_id).toBe('post-1');
        expect(images[0].r2_key).toBe('screenshots/abc.png');
        expect(images[0].channel_id).toBe('channel-1');
        expect(images[0].created_at).toBeDefined();
    });

    it('should track multiple post images from multi-channel publish', async () => {
        getDb(TEST_DB);
        await new Promise(r => setTimeout(r, 50));

        await trackPostImage('post-1', 'screenshots/img1.png', 'channel-1');
        await trackPostImage('post-2', 'screenshots/img1.png', 'channel-2');
        const images = await getUncleanedImages();

        expect(images).toHaveLength(2);
    });

    it('should remove a post image by post_id', async () => {
        getDb(TEST_DB);
        await new Promise(r => setTimeout(r, 50));

        await trackPostImage('post-1', 'screenshots/img.png', 'ch-1');
        await trackPostImage('post-2', 'screenshots/img2.png', 'ch-2');
        await removePostImage('post-1');

        const images = await getUncleanedImages();
        expect(images).toHaveLength(1);
        expect(images[0].post_id).toBe('post-2');
    });

    it('should return empty array when no post images exist', async () => {
        getDb(TEST_DB);
        await new Promise(r => setTimeout(r, 50));

        const images = await getUncleanedImages();
        expect(images).toEqual([]);
    });
});
