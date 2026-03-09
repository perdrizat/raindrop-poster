import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import authRoutes from './routes/auth.js';
import raindropioRoutes from './routes/raindropio.js';
import veniceRoutes from './routes/venice.js';
import scrapeRoutes from './routes/scrape.js';
import publishRoutes from './routes/publish.js';
import screenshotRoutes from './routes/screenshot.js';
import imageRoutes from './routes/image.js';
import systemRoutes from './routes/system.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import connectSqlite3 from 'connect-sqlite3';
import { getDb, getSetting, setSetting } from './services/db.js';

// Ensure DB is initialized (no .env file needed — all config via Setup page)
getDb();

const SQLiteStore = connectSqlite3(session);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: 'http://localhost:5173', // Must exactly match the Vite frontend for credentials
    credentials: true // Allow cookies to be sent along with API requests
}));
app.use(express.json());
app.use(cookieParser());

// Trust proxy if we are behind one (useful for dev containers or deployments)
app.set('trust proxy', 1);

// Auto-generate and persist SESSION_SECRET on first boot
const getSessionSecret = async () => {
    let secret = await getSetting('SESSION_SECRET');
    if (!secret) {
        secret = crypto.randomBytes(32).toString('hex');
        await setSetting('SESSION_SECRET', secret);
        console.log('Generated and persisted a new SESSION_SECRET.');
    }
    return secret;
};

// Configure sessions to persist OAuth tokens
const sessionSecret = await getSessionSecret();
app.use(session({
    store: new SQLiteStore({
        db: 'raindrop-sessions.sqlite',
        dir: (() => {
            const dataDir = process.env.DATA_DIR || process.cwd();
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            return dataDir;
        })()
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to false to allow OAuth sessions over HTTP (common in local Docker/self-hosted)
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Routes
app.use('/api/system', systemRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/raindropio', raindropioRoutes);
app.use('/api/venice', veniceRoutes);
app.use('/api/scrape', scrapeRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/screenshot', screenshotRoutes);
app.use('/api/imgbb', imageRoutes);

// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Serve static files from the React app
    app.use(express.static(path.join(__dirname, '../client/dist')));

    // The catchall handler: for any request that doesn't match an API route, send back React's index.html file.
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
