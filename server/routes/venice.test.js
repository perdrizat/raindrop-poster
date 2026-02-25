import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import veniceRoutes from './venice.js';
import axios from 'axios';

vi.mock('axios');

const app = express();
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
});
