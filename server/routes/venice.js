import express from 'express';
import axios from 'axios';

const router = express.Router();

router.get('/test', async (req, res) => {
    try {
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
            return res.status(401).json({ error: 'System VENICE_API_KEY is not configured' });
        }

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
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
            return res.status(401).json({ error: 'System VENICE_API_KEY is not configured' });
        }

        const { articleText, prompt, metadata } = req.body;

        if (!articleText) {
            return res.status(400).json({ error: 'Article text is required' });
        }

        let systemPrompt = '';

        if (metadata?.isHighlightSelection) {
            systemPrompt = `You are an expert editor for a tech-savvy creator. Your task is to pick the single most engaging highlight from the provided list based on the user's objectives.
You MUST output your response in STRICT JSON format exactly like this:
{
  "highlight": "The exact text of the chosen highlight without surrounding quotes"
}
Return only the raw JSON.`;
        } else {
            systemPrompt = `You are an expert Ghostwriter and Social Media Manager for a tech-savvy creator. Your task is to write 3 distinct, highly engaging Twitter post options based on the provided article text.

CRITICAL INSTRUCTIONS:
1. The user's specific "User Instructions (Objectives)" take absolute precedence over everything else regarding tone, style, and constraints.
2. The proposals should be loosely based on the provided Highlights, utilizing the full Article Text for context.
3. Length constraint: EACH tweet MUST be between 240 and 280 characters long. Do not write short tweets. This is a strict platform requirement.
4. Do not sound like a bot. Avoid generic marketing speak ("In today's fast-paced world...").
5. Use emojis sparingly (maximum 1 across all options) unless the user requests otherwise.
6. Also extract the Author's name from the Article Text. If you cannot find one, set it to null.

Provide 3 distinct options using these specific archetypes to give the user variety:
- Option 1 (The Insightful Hook): Focus on the core value, a surprising fact, or the "Aha!" moment from the article. Tone: Educational, helpful, authoritative.
- Option 2 (The Provocative Question): Challenge the status quo, highlight a controversial point, or ask a bold question based on the article. Tone: Questioning, slightly contrarian, thought-provoking.
- Option 3 (The Enthusiastic Champion): Strongly advocate for the article's solution, relating it to a common pain point. Tone: Enthusiastic, relatable, championing.

You MUST output your response in STRICT JSON format exactly like this:
{
  "proposals": [
    "Option 1 text here...",
    "Option 2 text here...",
    "Option 3 text here..."
  ],
  "author": "John Doe"
}

Ensure you provide exactly 3 proposals in the JSON array AND the extracted author. Do not include markdown blocks like \`\`\`json. Return only the raw JSON.`;
        }

        const userPrompt = `
Metadata:
Title: ${metadata?.title || 'Unknown'}
URL: ${metadata?.url || 'Unknown'}

Highlights:
${metadata?.highlights?.length > 0 ? metadata.highlights.map(h => `- ${h.text}`).join('\n') : 'None provided'}

User Instructions:
${prompt || 'Create engaging tweets.'}

Article Text:
${articleText}
`;

        const payload = {
            model: 'llama-3.3-70b',
            temperature: 0.8,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        };

        const displayUserPrompt = `
Metadata:
Title: ${metadata?.title || 'Unknown'}
URL: ${metadata?.url || 'Unknown'}

Highlights:
${metadata?.highlights?.length > 0 ? metadata.highlights.map(h => `- ${h.text}`).join('\n') : 'None provided'}

User Instructions (Objectives):
${prompt || 'Create engaging tweets.'}

Article Text:
${articleText.substring(0, 100).replace(/\\n/g, ' ')}... [TRUNCATED ${articleText.length} total chars]
`;

        console.log(`\n======================================================`);
        console.log(`[Venice.ai] --> Sending POST to /chat/completions`);
        console.log(`[Venice.ai] --> Model: ${payload.model}`);
        console.log(`[Venice.ai] --> System Prompt:\n${systemPrompt}`);
        console.log(`[Venice.ai] --> User Prompt:\n${displayUserPrompt}`);
        console.log(`======================================================\n`);

        const response = await axios.post('https://api.venice.ai/api/v1/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const rawContent = response.data.choices[0].message.content.trim();

        console.log(`\n======================================================`);
        console.log(`[Venice.ai] <-- Received successful response`);
        console.log(`[Venice.ai] <-- Raw Content:\n${rawContent}`);
        console.log(`======================================================\n`);

        let parsed;
        try {
            parsed = JSON.parse(rawContent);
        } catch (e) {
            const jsonMatch = rawContent.match(/```(?:json)?\\s*(\\{[\\s\\S]*?\\})\\s*```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
            } else {
                throw new Error("Failed to parse LLM response into JSON: " + rawContent);
            }
        }

        if (metadata?.isHighlightSelection) {
            res.json({ highlight: parsed.highlight });
        } else {
            res.json({ proposals: parsed.proposals, author: parsed.author });
        }
    } catch (error) {
        console.error('Venice API Generate Error:', error.response?.data || error.message);
        res.status(502).json({ error: 'Failed to generate content with Venice AI API' });
    }
});

export default router;
