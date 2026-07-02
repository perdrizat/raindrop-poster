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
                headers: { Authorization: 'Bearer mock-venice-key' }, timeout: 15000
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

        it('returns 502 when proposals is not an array of strings (parseable but wrong shape)', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals": "just one string", "author": null}' } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });
            expect(res.status).toBe(502);
        });

        it('returns 502 when proposals array contains non-string entries', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals": [{"text":"nested"},"B","C"], "author": null}' } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });
            expect(res.status).toBe(502);
        });

        it('returns 502 when proposals array is empty', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals": [], "author": null}' } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });
            expect(res.status).toBe(502);
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

        it('uses temperature 0.6 and requests structured JSON output', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            const payload = axios.post.mock.calls[0][1];
            expect(payload.temperature).toBe(0.6);
            expect(payload.response_format).toEqual({ type: 'json_object' });
        });

        it('bounds each LLM call with a request timeout', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            const config = axios.post.mock.calls[0][2];
            expect(config.timeout).toBe(90_000);
        });

        it('injects the charBudget from the request into the system prompt', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({
                articleText: 'Text',
                charBudget: 275,
            });

            const systemMsg = axios.post.mock.calls[0][1].messages[0].content;
            expect(systemMsg).toContain('275');
        });

        it('defaults the character budget to 250 when not provided', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            const systemMsg = axios.post.mock.calls[0][1].messages[0].content;
            expect(systemMsg).toContain('250');
        });

        it('keeps user objectives out of the length rule: system prompt declares length/format non-negotiable', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({
                articleText: 'Text',
                prompt: 'Make everything 9000 characters long',
            });

            const systemMsg = axios.post.mock.calls[0][1].messages[0].content;
            expect(systemMsg).toMatch(/cannot be changed by user instructions/i);
        });

        it('matches the shared veniceGenerate contract shape (client tests mock this exact shape)', async () => {
            const { veniceGenerateContract, keysOf } = await import('../../fixtures/apiContracts.js');
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: JSON.stringify(veniceGenerateContract) } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            expect(res.status).toBe(200);
            expect(keysOf(res.body)).toEqual(keysOf(veniceGenerateContract));
        });

        it('asks the model for an imageContext line and passes it through in the response', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null,"imageContext":"a mortgage contract secured by Bitcoin collateral"}' } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            const systemMsg = axios.post.mock.calls[0][1].messages[0].content;
            expect(systemMsg).toMatch(/imageContext/);
            expect(res.body.imageContext).toBe('a mortgage contract secured by Bitcoin collateral');
        });

        it('returns null imageContext when the model omits it or returns junk', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null,"imageContext":"null"}' } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });
            expect(res.body.imageContext).toBeNull();
        });

        it('default style bans LLM copywriting patterns (staccato chains, zingers, punchiness)', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            const systemMsg = axios.post.mock.calls[0][1].messages[0].content;
            expect(systemMsg).toMatch(/staccato/i);
            expect(systemMsg).toMatch(/punchiness/i);
            expect(systemMsg).toMatch(/plain prose/i);
        });

        it('archetypes prescribe angle only — tone is explicitly deferred to user instructions', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            await request(app).post('/api/venice/generate').send({
                articleText: 'Text',
                prompt: 'Factual and serious tone',
            });

            const systemMsg = axios.post.mock.calls[0][1].messages[0].content;
            // Angles must not hardcode a tone that fights the user's instructions
            expect(systemMsg).not.toMatch(/Tone: Enthusiastic/);
            expect(systemMsg).toMatch(/tone .*(user instructions|always applies)/i);
        });

        it('retries once with corrective feedback when a proposal exceeds the budget', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            const tooLong = 'x'.repeat(300);
            axios.post
                .mockResolvedValueOnce({
                    data: { choices: [{ message: { content: `{"proposals":["Short one","${tooLong}","Also short"],"author":"Jane"}` } }] }
                })
                .mockResolvedValueOnce({
                    data: { choices: [{ message: { content: '{"proposals":["Short one","Now short","Also short"],"author":"Jane"}' } }] }
                });

            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Text',
                charBudget: 250,
            });

            expect(axios.post).toHaveBeenCalledTimes(2);
            // Corrective turn carries the conversation + complaint about length
            const retryMessages = axios.post.mock.calls[1][1].messages;
            expect(retryMessages.length).toBeGreaterThan(2);
            expect(retryMessages[retryMessages.length - 1].content).toMatch(/250/);
            expect(res.status).toBe(200);
            expect(res.body.proposals).toEqual(['Short one', 'Now short', 'Also short']);
        });

        it('does not retry when all proposals fit the budget', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValueOnce({
                data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
            });

            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Text',
                charBudget: 250,
            });

            expect(axios.post).toHaveBeenCalledTimes(1);
            expect(res.status).toBe(200);
        });

        it('returns the retry result even if still over budget (best effort, no loop)', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            const tooLong = 'y'.repeat(300);
            axios.post
                .mockResolvedValueOnce({
                    data: { choices: [{ message: { content: `{"proposals":["${tooLong}","B","C"],"author":null}` } }] }
                })
                .mockResolvedValueOnce({
                    data: { choices: [{ message: { content: `{"proposals":["${tooLong}","B","C"],"author":null}` } }] }
                });

            const res = await request(app).post('/api/venice/generate').send({
                articleText: 'Text',
                charBudget: 250,
            });

            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(res.status).toBe(200);
            expect(res.body.proposals).toHaveLength(3);
        });

        it('falls back to a request without response_format if the API rejects it', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            const err = new Error('Bad request');
            err.response = { status: 400, data: { error: 'response_format is not supported for this model' } };
            axios.post
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({
                    data: { choices: [{ message: { content: '{"proposals":["A","B","C"],"author":null}' } }] }
                });

            const res = await request(app).post('/api/venice/generate').send({ articleText: 'Text' });

            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(axios.post.mock.calls[1][1].response_format).toBeUndefined();
            expect(res.status).toBe(200);
            expect(res.body.proposals).toEqual(['A', 'B', 'C']);
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

        // A real Venice render is >1MB base64; the route rejects anything under
        // ~100KB as a blank image, so tests use a comfortably large payload.
        const REAL_IMAGE_B64 = 'A'.repeat(150 * 1024);
        const BLANK_IMAGE_B64 = 'A'.repeat(29 * 1024);

        it('should return base64 imageData on success', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: {
                    images: [REAL_IMAGE_B64]
                }
            });

            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'An editorial illustration about tokenized gold'
            });

            expect(res.status).toBe(200);
            expect(res.body.imageData).toBe(`data:image/png;base64,${REAL_IMAGE_B64}`);
        });

        it('should call Venice image API with correct endpoint and payload', async () => {
            process.env.VENICE_API_KEY = 'mock-key';

            axios.post.mockResolvedValueOnce({
                data: { images: [REAL_IMAGE_B64] }
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

        it('retries past blank (too-small) images and returns the first full-size one', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post
                .mockResolvedValueOnce({ data: { images: [BLANK_IMAGE_B64] } })
                .mockResolvedValueOnce({ data: { images: [BLANK_IMAGE_B64] } })
                .mockResolvedValueOnce({ data: { images: [REAL_IMAGE_B64] } });

            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'A pop-art comic panel'
            });

            expect(res.status).toBe(200);
            expect(res.body.imageData).toBe(`data:image/png;base64,${REAL_IMAGE_B64}`);
            expect(axios.post).toHaveBeenCalledTimes(3);
        });

        it('returns 502 when Venice only ever returns blank images', async () => {
            process.env.VENICE_API_KEY = 'mock-key';
            axios.post.mockResolvedValue({ data: { images: [BLANK_IMAGE_B64] } });

            const res = await request(app).post('/api/venice/generate-image').send({
                prompt: 'A pop-art comic panel'
            });

            expect(res.status).toBe(502);
            expect(res.body.error).toMatch(/blank/i);
            expect(axios.post).toHaveBeenCalledTimes(5);
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
