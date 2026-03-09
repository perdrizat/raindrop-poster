import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, getSetting, setSetting, closeDb } from './db.js';
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
});
