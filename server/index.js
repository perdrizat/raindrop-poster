import express from 'express';
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import raindropioRoutes from './routes/raindropio.js';
import veniceRoutes from './routes/venice.js';
import scrapeRoutes from './routes/scrape.js';
import publishRoutes from './routes/publish.js';
import screenshotRoutes from './routes/screenshot.js';
import imageRoutes from './routes/image.js';
import systemRoutes from './routes/system.js';
import path from 'path';
import { fileURLToPath } from 'url';
import connectSqlite3 from 'connect-sqlite3';
import { getDb } from './services/db.js';

// Load env vars
dotenv.config();

// Ensure DB is initialized
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

// Configure sessions to persist OAuth tokens
app.use(session({
    store: new SQLiteStore({
        db: 'raindrop-sessions.sqlite',
        dir: process.cwd()
    }),
    secret: process.env.SESSION_SECRET || 'fallback-secret-for-dev-only',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
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
