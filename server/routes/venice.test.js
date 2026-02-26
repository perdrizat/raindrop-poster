import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import veniceRoutes from './venice.js';
import axios from 'axios';

vi.mock('axios');

const app = express();
app.use(express.json());
app.use('/api/venice', veniceRoutes);

describe('Venice API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.VENICE_API_KEY;
    });

    describe('GET /api/venice/test', () => {
        it('should return 401 if global VENICE_API_KEY is missing', async () => {
            const res = await request(app).get('/api/venice/test');
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'System VENICE_API_KEY is not configured' });
        });

        it('should return success and model count if token is valid', async () => {
            process.env.VENICE_API_KEY = 'mock-venice-key';

            axios.get.mockResolvedValueOnce({
                data: {
                    data: [{ id: 'model-1' }, { id: 'model-2' }]
                }
            });

            const res = await request(app).get('/api/venice/test');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, modelsCount: 2, message: 'Successfully connected to Venice AI' });
            expect(axios.get).toHaveBeenCalledWith('https://api.venice.ai/api/v1/models', {
                headers: { Authorization: 'Bearer mock-venice-key' }
            });
        });
    });

    describe('POST /api/venice/generate', () => {
        it('should return 400 if article text is missing', async () => {
            process.env.VENICE_API_KEY = 'mock';
            const res = await request(app).post('/api/venice/generate').send({ prompt: 'Test' });
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ error: 'Article text is required' });
        });

        it('should successfully prompt Venice and return proposals within JSON structure', async () => {
            process.env.VENICE_API_KEY = 'mock-venice-key';

            axios.post.mockResolvedValueOnce({
                data: {
                    choices: [
                        { message: { content: '{"proposals":["Tweet 1","Tweet 2","Tweet 3"], "author":"Jane Doe"}' } }
                    ]
                }
            });

            const reqBody = {
                articleText: 'Mock article text.',
                prompt: 'Custom user prompt',
                metadata: { title: 'Test', url: 'http://test.com' }
            };

            const res = await request(app).post('/api/venice/generate').send(reqBody);

            expect(res.status).toBe(200);
            expect(res.body.proposals).toHaveLength(3);
            expect(res.body.author).toBe('Jane Doe');
            expect(axios.post).toHaveBeenCalledWith('https://api.venice.ai/api/v1/chat/completions', expect.any(Object), expect.any(Object));
        });

        it('should handle API errors gracefully', async () => {
            process.env.VENICE_API_KEY = 'mock';
            axios.post.mockRejectedValueOnce(new Error('Venice error'));

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'text' });
            expect(res.status).toBe(502);
        });
    });
});
