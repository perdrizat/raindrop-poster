import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance = null;
let customDbPath = null;

export const getDb = (dbPath = null) => {
    // If a path is provided and it's different, close the old one (useful for testing)
    if (dbInstance && dbPath && dbPath !== customDbPath) {
        dbInstance.close();
        dbInstance = null;
    }

    if (!dbInstance) {
        const dataDir = process.env.DATA_DIR || process.cwd();
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        customDbPath = dbPath || path.join(dataDir, 'raindrop.sqlite');

        // We use synchronous-style operations for settings via better-sqlite3 or wrapped sqlite3
        // Since we installed 'sqlite3', we will wrap basic methods.
        dbInstance = new sqlite3.Database(customDbPath);

        // Initialize schema
        dbInstance.serialize(() => {
            dbInstance.run(`
                CREATE TABLE IF NOT EXISTS Settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            `);
            dbInstance.run(`
                CREATE TABLE IF NOT EXISTS post_images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_id TEXT NOT NULL,
                    r2_key TEXT NOT NULL,
                    channel_id TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            `);
        });
    }
    return dbInstance;
};

// Promise wrappers around sqlite3's callback API. `run` keeps the classic
// `function` callback so `this` (lastID/changes) is preserved for callers.
const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
        getDb().run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });

const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });

export const setSetting = (key, value) =>
    run(
        `INSERT INTO Settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
    );

export const getSetting = async (key) => {
    const row = await get(`SELECT value FROM Settings WHERE key = ?`, [key]);
    return row ? row.value : null;
};

// Config lookup with a single precedence rule: environment variable wins,
// SQLite setting is the fallback. Use this instead of hand-rolling
// `process.env.X || await getSetting('X')` at call sites.
export const getConfig = async (key) => {
    return process.env[key] || await getSetting(key);
};

// --- post_images helpers ---

export const trackPostImage = (postId, r2Key, channelId) =>
    run(`INSERT INTO post_images (post_id, r2_key, channel_id) VALUES (?, ?, ?)`, [
        postId,
        r2Key,
        channelId,
    ]);

export const getUncleanedImages = () =>
    all(`SELECT * FROM post_images ORDER BY created_at ASC`);

export const removePostImage = (postId) =>
    run(`DELETE FROM post_images WHERE post_id = ?`, [postId]);

export const closeDb = () => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            dbInstance.close((err) => {
                dbInstance = null;
                if (err) reject(err);
                else resolve();
            });
        } else {
            resolve();
        }
    });
};
