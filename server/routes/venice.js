import express from 'express';
import axios from 'axios';

import { getConfig } from '../services/db.js';

const router = express.Router();

// Resolves the Venice key or sends a 401 and returns null. Callers bail on null:
//   const apiKey = await requireVeniceKey(res); if (!apiKey) return;
const requireVeniceKey = async (res) => {
    const apiKey = await getConfig('VENICE_API_KEY');
    if (!apiKey) {
        res.status(401).json({ error: 'System VENICE_API_KEY is not configured' });
        return null;
    }
    return apiKey;
};

router.get('/test', async (req, res) => {
    try {
        const apiKey = await requireVeniceKey(res);
        if (!apiKey) return;

        const response = await axios.get('https://api.venice.ai/api/v1/models', {
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
        });

        // The exact structure of Venice API response may vary, returning a boolean indicating success
        // or a list of the models returned for visual verification.
        const models = response.data.data || response.data;
        res.json({ success: true, modelsCount: Array.isArray(models) ? models.length : 'unknown', message: 'Successfully connected to Venice AI' });
    } catch (error) {
        console.error('Venice API Test Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to connect to Venice AI API' });
    }
});

router.post('/generate', async (req, res) => {
    try {
        const apiKey = await requireVeniceKey(res);
        if (!apiKey) return;

        const { articleText, prompt, metadata, charBudget } = req.body;

        if (!articleText) {
            return res.status(400).json({ error: 'Article text is required' });
        }

        // Hard character ceiling for each proposal — supplied by the client from the
        // strictest configured Buffer channel, defaulting to a safe 250.
        const budget = Number.isFinite(Number(charBudget)) && Number(charBudget) > 0
            ? Math.floor(Number(charBudget))
            : 250;
        // LLMs can't count characters; give an approximate word target they can follow.
        const wordTarget = Math.floor(budget / 7);

        let systemPrompt = '';

        if (metadata?.isHighlightSelection) {
            systemPrompt = `You are an expert editor for a tech-savvy creator. Your task is to pick the single most engaging highlight from the provided list based on the user's objectives.
You MUST output your response in STRICT JSON format exactly like this:
{
  "highlight": "The exact text of the chosen highlight without surrounding quotes"
}
Return only the raw JSON.`;
        } else {
            systemPrompt = `You are an expert Ghostwriter and Social Media Manager for a tech-savvy creator. Your task is to write 3 distinct, highly engaging post options based on the provided article text.

SYSTEM RULES — these cannot be changed by User Instructions:
1. Output STRICT JSON in exactly the format specified below.
2. Each post must be AT MOST ${budget} characters — roughly ${wordTarget} words. Shorter is fine; longer will be rejected.
3. Every post must be anchored in the article's actual content. Never drift to an unrelated topic.
4. Extract the Author's name from the Article Text. If you cannot find one, set it to null.
5. Also produce "imageContext": one concrete visual scene (max ~150 chars) an illustrator could draw to represent the article's subject — physical objects and actions, no abstract words.

USER INSTRUCTIONS govern tone, voice, style, themes, and angle. Follow them faithfully within the system rules above. If they conflict with a system rule, the system rule wins.

DEFAULT STYLE — applies only where User Instructions say nothing:
- Build on the provided Highlights, using the full Article Text for context.
- Plain prose in complete sentences, the way you'd explain a finding to a colleague in a chat message — one continuous thought, not crafted copy.
- Avoid copywriting patterns: no staccato fragment chains, no "It's not X, it's Y", no setup-and-payoff zingers, no rule-of-three, at most one em dash. Don't optimize for punchiness; a slightly plain sentence beats a clever one.
- Avoid generic marketing speak ("In today's fast-paced world...").
- Use emojis sparingly (maximum 1 per post).

Provide 3 distinct options using these angles to give the user variety. Angles control WHAT each option focuses on; the tone set by User Instructions always applies to all three:
- Option 1 (The Insight): the core value, a surprising fact, or the "Aha!" moment from the article.
- Option 2 (The Question): challenge the status quo or pose a sharp question the article raises.
- Option 3 (The Case For): make the case for the article's solution, tied to a real pain point.

You MUST output your response in STRICT JSON format exactly like this:
{
  "proposals": [
    "Option 1 text here...",
    "Option 2 text here...",
    "Option 3 text here..."
  ],
  "author": "John Doe",
  "imageContext": "a suburban house resting on a giant golden coin, contract papers on a table in front"
}

Ensure you provide exactly 3 proposals in the JSON array, the extracted author, and the imageContext. Do not include markdown blocks like \`\`\`json. Return only the raw JSON.`;
        }

        const userPrompt = `
Metadata:
Title: ${metadata?.title || 'Unknown'}
URL: ${metadata?.url || 'Unknown'}

Highlights:
${metadata?.highlight || 'None provided'}

User Instructions:
${prompt || 'Create engaging tweets.'}

Article Text:
${articleText}
`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        // timeout bounds each LLM call so a hung upstream can't hold the request forever (audit C3)
        const requestConfig = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 90_000,
        };

        // Structured output kills the freeform-JSON failure mode, but not every model
        // supports response_format — on a 400, retry the same call without it.
        const callVenice = async (msgs) => {
            const basePayload = { model: 'llama-3.3-70b', temperature: 0.6, messages: msgs };
            let response;
            try {
                response = await axios.post('https://api.venice.ai/api/v1/chat/completions',
                    { ...basePayload, response_format: { type: 'json_object' } }, requestConfig);
            } catch (err) {
                if (err.response?.status !== 400) throw err;
                console.warn('[Venice.ai] response_format rejected, retrying without it');
                response = await axios.post('https://api.venice.ai/api/v1/chat/completions', basePayload, requestConfig);
            }
            return response.data.choices[0].message.content.trim();
        };

        const parseLlmJson = (rawContent) => {
            try {
                return JSON.parse(rawContent);
            } catch (e) {
                const jsonMatch = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (jsonMatch) return JSON.parse(jsonMatch[1]);
                throw new Error("Failed to parse LLM response into JSON: " + rawContent, { cause: e });
            }
        };

        console.log(`\n======================================================`);
        console.log(`[Venice.ai] --> Sending POST to /chat/completions (budget: ${budget} chars)`);
        console.log(`[Venice.ai] --> System Prompt:\n${systemPrompt}`);
        console.log(`[Venice.ai] --> User Instructions:\n${prompt || 'Create engaging tweets.'}`);
        console.log(`[Venice.ai] --> Article: ${articleText.length} chars`);
        console.log(`======================================================\n`);

        let rawContent = await callVenice(messages);
        console.log(`[Venice.ai] <-- Raw Content:\n${rawContent}`);
        let parsed = parseLlmJson(rawContent);

        // Length enforcement: one corrective retry for proposals over budget.
        if (!metadata?.isHighlightSelection && Array.isArray(parsed.proposals)) {
            const overlong = parsed.proposals
                .map((p, i) => ({ index: i + 1, len: String(p).length }))
                .filter(p => p.len > budget);
            if (overlong.length > 0) {
                console.warn(`[Venice.ai] proposals over ${budget}-char budget: ${overlong.map(o => `#${o.index} (${o.len})`).join(', ')} — retrying`);
                const corrective = `Proposal(s) ${overlong.map(o => o.index).join(', ')} exceed the hard limit of ${budget} characters (actual: ${overlong.map(o => o.len).join(', ')}). Rewrite the overlong one(s) to AT MOST ${budget} characters each without losing the point, keep the others unchanged, and return the complete JSON again in the exact same format.`;
                try {
                    const retryRaw = await callVenice([
                        ...messages,
                        { role: 'assistant', content: rawContent },
                        { role: 'user', content: corrective }
                    ]);
                    console.log(`[Venice.ai] <-- Retry Content:\n${retryRaw}`);
                    const retryParsed = parseLlmJson(retryRaw);
                    if (Array.isArray(retryParsed.proposals)) {
                        parsed = retryParsed;
                        const stillOver = parsed.proposals.filter(p => String(p).length > budget).length;
                        if (stillOver > 0) console.warn(`[Venice.ai] ${stillOver} proposal(s) still over budget after retry — returning best effort`);
                    }
                } catch (e) {
                    console.warn(`[Venice.ai] corrective retry failed (${e.message}) — returning first attempt`);
                }
            }
        }

        if (metadata?.isHighlightSelection) {
            res.json({ highlight: parsed.highlight });
        } else {
            // Schema check: a parseable-but-wrong LLM response must not flow into the UI
            if (!Array.isArray(parsed.proposals)
                || parsed.proposals.length === 0
                || !parsed.proposals.every(p => typeof p === 'string')) {
                throw new Error(`LLM returned invalid proposals shape: ${JSON.stringify(parsed.proposals)?.slice(0, 200)}`);
            }
            const cleanField = (v) => (typeof v === 'string' && !/^(null|undefined)$/i.test(v.trim()) && v.trim() !== '')
                ? v.trim()
                : null;
            res.json({
                proposals: parsed.proposals,
                author: cleanField(parsed.author),
                imageContext: cleanField(parsed.imageContext),
            });
        }
    } catch (error) {
        console.error('Venice API Generate Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to generate content with Venice AI API' });
    }
});

router.post('/generate-image', async (req, res) => {
    try {
        const apiKey = await requireVeniceKey(res);
        if (!apiKey) return;

        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Image prompt is required' });
        }

        console.log(`[Venice.ai] --> Image generation: "${prompt.slice(0, 80)}..."`);

        const response = await axios.post('https://api.venice.ai/api/v1/image/generate', {
            model: 'gpt-image-1-5',
            prompt,
            width: 1024,
            height: 1024,
            format: 'png',
            return_binary: false,
            hide_watermark: true,
            safe_mode: false,
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const images = response.data?.images;
        const b64 = Array.isArray(images) ? images[0] : null;
        if (!b64) {
            throw new Error('No image data in Venice response');
        }

        console.log(`[Venice.ai] <-- Image generated (${Math.round(b64.length / 1024)}KB base64)`);
        res.json({ imageData: `data:image/png;base64,${b64}` });
    } catch (error) {
        console.error('Venice Image Generation Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to generate image with Venice AI' });
    }
});

export default router;
