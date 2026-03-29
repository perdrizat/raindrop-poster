import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import veniceRoutes from './venice.js';
import axios from 'axios';
import { setSetting } from '../services/db.js';

vi.mock('axios');

const app = express();
app.use(express.json());
app.use('/api/venice', veniceRoutes);

describe('Venice API Routes', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        delete process.env.VENICE_API_KEY;
        await setSetting('VENICE_API_KEY', '');
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
                metadata: { title: 'Test', url: 'http://test.com', highlight: 'Best highlight text' }
            };

            const res = await request(app).post('/api/venice/generate').send(reqBody);

            expect(res.status).toBe(200);
            expect(res.body.proposals).toHaveLength(3);
            expect(res.body.author).toBe('Jane Doe');
            expect(res.body.selectedHighlight).toBeUndefined(); // Verifying it correctly returns undefined since it's removed
            expect(axios.post).toHaveBeenCalledWith('https://api.venice.ai/api/v1/chat/completions', expect.any(Object), expect.any(Object));
        });

        it('should handle API errors gracefully', async () => {
            process.env.VENICE_API_KEY = 'mock';
            axios.post.mockRejectedValueOnce(new Error('Venice error'));

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'text' });
            expect(res.status).toBe(502);
        });

        it('should return highlight when isHighlightSelection is true', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: {
                    choices: [
                        { message: { content: '{"highlight":"The best quote from the article"}' } }
                    ]
                }
            });

            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Some article text',
                metadata: { isHighlightSelection: true, highlight: 'quote1\nquote2' }
            });

            expect(res.status).toBe(200);
            expect(res.body.highlight).toBe('The best quote from the article');
            expect(res.body.proposals).toBeUndefined();
        });

        it('should parse markdown-wrapped JSON from LLM response', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: {
                    choices: [
                        { message: { content: '```json\n{"proposals":["A","B","C"], "author":"Bob"}\n```' } }
                    ]
                }
            });

            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Article text here'
            });

            expect(res.status).toBe(200);
            expect(res.body.proposals).toEqual(['A', 'B', 'C']);
            expect(res.body.author).toBe('Bob');
        });

        it('should return 502 when LLM returns completely malformed output', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: {
                    choices: [
                        { message: { content: 'This is not JSON at all, just plain text rambling.' } }
                    ]
                }
            });

            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Article text'
            });

            expect(res.status).toBe(502);
            expect(res.body.error).toMatch(/Failed to generate/);
        });

        it('should return 401 if VENICE_API_KEY is not configured for generate', async () => {
            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Some text'
            });

            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/VENICE_API_KEY.*not configured/);
        });
    });

    describe('POST /api/venice/generate-image', () => {
        it('should return 401 if VENICE_API_KEY is not configured', async () => {
            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'A beautiful sunset'
            });
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/VENICE_API_KEY.*not configured/);
        });

        it('should return 400 if prompt is missing', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            const res = await request(app).post('/api/venice/generate-image').send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/prompt.*required/i);
        });

        it('should return base64 imageData on success', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: {
                    images: ['iVBORw0KGgoAAAANSUhEUg==']
                }
            });

            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'An editorial illustration about tokenized gold'
            });

            expect(res.status).toBe(200);
            expect(res.body.imageData).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
        });

        it('should call Venice image API with correct endpoint and payload', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: { images: ['abc123'] }
            });

            await request(app).post('/api/venice/generate-image').send({
                prompt: 'A futuristic city'
            });

            expect(axios.post).toHaveBeenCalledWith(
                'https://api.venice.ai/api/v1/image/generate',
                expect.objectContaining({
                    model: 'gpt-image-1-5',
                    prompt: expect.stringContaining('futuristic city'),
                    format: 'png',
                    return_binary: false,
                }),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer mock-key',
                    })
                })
            );
        });

        it('should return 502 when Venice image API errors', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockRejectedValueOnce(new Error('Venice image API down'));

            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'Something'
            });

            expect(res.status).toBe(502);
            expect(res.body.error).toMatch(/Failed to generate/i);
        });

        it('should handle unexpected response shape gracefully', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { images: [] }
            });

            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'Something'
            });

            expect(res.status).toBe(502);
            expect(res.body.error).toMatch(/Failed to generate/i);
        });
    });

    describe('GET /api/venice/test (error handling)', () => {
        it('should return 502 when Venice API connection fails', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            const res = await request(app).get('/api/venice/test');
            expect(res.status).toBe(502);
            expect(res.body.error).toMatch(/Failed to connect/);
        });

        it('should handle non-array models response gracefully', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.get.mockResolvedValueOnce({
                data: { data: 'not-an-array' }
            });

            const res = await request(app).get('/api/venice/test');
            expect(res.status).toBe(200);
            expect(res.body.modelsCount).toBe('unknown');
        });
    });
});
