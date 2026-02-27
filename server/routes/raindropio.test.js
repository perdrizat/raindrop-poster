import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import raindropioRoutes from './raindropio.js';
import axios from 'axios';

vi.mock('axios');

const app = express();
app.use(express.json());
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true
}));

// Route protection mock middleware
app.use((req, res, next) => {
    if (req.headers.authorization === 'Bearer mock-rd-token') {
        req.session.raindropio = { accessToken: 'mock-rd-token' };
    }
    next();
});

app.use('/api/raindropio', raindropioRoutes);

describe('Raindrop API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/raindropio/test', () => {
        it('should return 401 if user is not authenticated with Raindrop', async () => {
            const res = await request(app).get('/api/raindropio/test');
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Not authenticated with Raindrop' });
        });

        it('should return success and username if token is valid', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    user: { fullName: 'Test User' }
                }
            });

            const res = await request(app)
                .get('/api/raindropio/test')
                .set('Authorization', 'Bearer mock-rd-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, user: 'Test User' });
            expect(axios.get).toHaveBeenCalledWith('https://api.raindrop.io/rest/v1/user', {
                headers: { Authorization: 'Bearer mock-rd-token' }
            });
        });
    });

    describe('GET /api/raindropio/tags', () => {
        it('should return 401 if user is not authenticated with Raindrop', async () => {
            const res = await request(app).get('/api/raindropio/tags');
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Not authenticated with Raindrop' });
        });

        it('should return success and tags array if token is valid', async () => {
            axios.get.mockResolvedValueOnce({
                data: {
                    items: [
                        { _id: 'tag1', count: 5 },
                        { _id: 'tag2', count: 10 }
                    ]
                }
            });

            const res = await request(app)
                .get('/api/raindropio/tags')
                .set('Authorization', 'Bearer mock-rd-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                tags: [
                    { _id: 'tag1', count: 5 },
                    { _id: 'tag2', count: 10 }
                ]
            });
            expect(axios.get).toHaveBeenCalledWith('https://api.raindrop.io/rest/v1/tags', {
                headers: { Authorization: 'Bearer mock-rd-token' }
            });
        });
    });
    describe('GET /api/raindropio/raindrops/0', () => {
        it('should return 401 if user is not authenticated with Raindrop', async () => {
            const res = await request(app).get('/api/raindropio/raindrops/0');
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Not authenticated with Raindrop' });
        });

        it('should return success and items array if token is valid', async () => {
            const mockItems = [{ _id: 1, title: 'Test Article', link: 'https://example.com' }];
            axios.get.mockResolvedValueOnce({
                data: {
                    items: mockItems
                }
            });

            const res = await request(app)
                .get('/api/raindropio/raindrops/0')
                .query({ search: '[{"key":"tag","val":"to-tweet"}]' })
                .set('Authorization', 'Bearer mock-rd-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                items: mockItems
            });
            expect(axios.get).toHaveBeenCalledWith('https://api.raindrop.io/rest/v1/raindrops/0?search=[{"key":"tag","val":"to-tweet"}]', {
                headers: { Authorization: 'Bearer mock-rd-token' }
            });
        });
    });

    describe('PUT /api/raindropio/bookmark/:id', () => {
        it('should return 401 if user is not authenticated with Raindrop', async () => {
            const res = await request(app)
                .put('/api/raindropio/bookmark/1234')
                .send({ tags: ['tag1'] });

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Not authenticated with Raindrop' });
        });

        it('should return success if token is valid and Raindrop API updates successfully', async () => {
            axios.put.mockResolvedValueOnce({
                data: {
                    item: { _id: 1234, tags: ['new_tag'] }
                }
            });

            const res = await request(app)
                .put('/api/raindropio/bookmark/1234')
                .send({ tags: ['new_tag'] })
                .set('Authorization', 'Bearer mock-rd-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                item: { _id: 1234, tags: ['new_tag'] }
            });
            expect(axios.put).toHaveBeenCalledWith('https://api.raindrop.io/rest/v1/raindrop/1234', { tags: ['new_tag'] }, {
                headers: { Authorization: 'Bearer mock-rd-token' }
            });
        });

        it('should handle Raindrop API update errors gracefully', async () => {
            axios.put.mockRejectedValueOnce({
                response: { data: { errorMessage: 'Invalid tag' } },
                message: 'API Error'
            });

            const res = await request(app)
                .put('/api/raindropio/bookmark/1234')
                .send({ tags: ['invalid'] })
                .set('Authorization', 'Bearer mock-rd-token');

            expect(res.status).toBe(502);
            expect(res.body).toEqual({ error: 'Failed to update bookmark in Raindrop API' });
        });
    });
});

