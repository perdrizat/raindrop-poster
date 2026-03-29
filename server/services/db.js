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

// Promise-wrapped wrapper for sqlite3 run
export const setSetting = (key, value) => {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.run(
            `INSERT INTO Settings (key, value) VALUES (?, ?) 
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [key, value],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    });
};

// Promise-wrapped wrapper for sqlite3 get
export const getSetting = (key) => {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.get(
            `SELECT value FROM Settings WHERE key = ?`,
            [key],
            (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.value : null);
            }
        );
    });
};

// --- post_images helpers ---

export const trackPostImage = (postId, r2Key, channelId) => {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.run(
            `INSERT INTO post_images (post_id, r2_key, channel_id) VALUES (?, ?, ?)`,
            [postId, r2Key, channelId],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    });
};

export const getUncleanedImages = () => {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.all(
            `SELECT * FROM post_images ORDER BY created_at ASC`,
            [],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            }
        );
    });
};

export const removePostImage = (postId) => {
    return new Promise((resolve, reject) => {
        const db = getDb();
        db.run(
            `DELETE FROM post_images WHERE post_id = ?`,
            [postId],
            function (err) {
                if (err) reject(err);
                else resolve(this);
            }
        );
    });
};

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
