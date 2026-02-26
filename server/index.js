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

// Load env vars
dotenv.config();

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
// In production, this should use a real store (like Redis or PostgreSQL) instead of MemoryStore
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-for-dev-only',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/raindropio', raindropioRoutes);
app.use('/api/venice', veniceRoutes);
app.use('/api/scrape', scrapeRoutes);
app.use('/api/publish', publishRoutes);

// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
