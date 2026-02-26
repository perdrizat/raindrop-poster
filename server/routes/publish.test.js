import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import publishRoutes from './publish';

vi.mock('twitter-api-v2', () => {
    return {
        TwitterApi: class {
            constructor() {
                this.v2 = {
                    tweet: vi.fn().mockResolvedValue({ data: { id: 'mock-tweet-id' } }),
                    me: vi.fn().mockResolvedValue({ data: { username: 'mockuser' } })
                };
            }
        }
    };
});

// Setup basic express app for testing router
const app = express();
app.use(express.json());

// Mock session middleware to inject user tokens during tests
app.use((req, res, next) => {
    req.session = {};
    next();
});

describe('POST /api/publish', () => {

    it('should fail if user is not authenticated with Twitter', async () => {
        // App without populated session
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, res, next) => {
            req.session = {};
            next();
        });
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ tweet1: 'T1', tweet2: 'T2' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/Twitter connection required/i);
    });

    it('should call Twitter API to publish thread and return success', async () => {
        // App WITH populated session
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, res, next) => {
            req.session = {
                twitter: {
                    accessToken: 'mock-access',
                    accessSecret: 'mock-secret'
                }
            };
            next();
        });
        testApp.use('/api/publish', publishRoutes);

        const response = await request(testApp)
            .post('/api/publish')
            .send({ tweet1: 'Test Tweet 1', tweet2: 'Test Tweet 2' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.url).toBeDefined();
    });
});
