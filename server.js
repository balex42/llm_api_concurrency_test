const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Generate prompts first using structured output (json schema) with fallback
app.post('/api/generate-prompts', async (req, res) => {
    const { apiUrl, apiKey, model, instructions, numPrompts } = req.body;

    if (!apiUrl || !apiKey || !model || !instructions || !numPrompts) {
        return res.status(400).json({ error: 'Missing required fields: apiUrl, apiKey, model, instructions, numPrompts' });
    }

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    const systemPrompt = `You generate diverse, high-quality prompts for testing LLM inference.\n` +
        `Return ONLY JSON matching the provided JSON schema. No extra text, no code fences.`;
    const userPrompt = `Generate ${numPrompts} high-quality, diverse prompts following these instructions:\n\n${instructions}\n\n` +
        `Ensure each prompt is self-contained and suitable for a chat completion API. Keep them concise.`;

    const jsonSchema = {
        name: 'prompt_list',
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['prompts'],
            properties: {
                prompts: {
                    type: 'array',
                    minItems: 1,
                    maxItems: Math.max(1, Math.min(500, Number(numPrompts) || 1)),
                    items: { type: 'string' }
                }
            }
        }
    };

    // First attempt: structured output via response_format json_schema (OpenAI-compatible)
    try {
        const resp = await axios.post(`${apiUrl}/v1/chat/completions`, {
            model,
            temperature: 0.7,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_schema', json_schema: jsonSchema },
            stream: false
        }, { headers });

        const content = resp.data?.choices?.[0]?.message?.content;
        let parsed;
        try {
            parsed = content && JSON.parse(content);
        } catch (_) {
            // Try to strip code fences if present
            const stripped = String(content || '').replace(/^```(?:json)?\n|```$/g, '').trim();
            parsed = JSON.parse(stripped);
        }
        const prompts = Array.isArray(parsed?.prompts) ? parsed.prompts : [];
        return res.json({ prompts });
    } catch (err) {
        // Fallback: ask for strict JSON without schema
        try {
            const resp2 = await axios.post(`${apiUrl}/v1/chat/completions`, {
                model,
                temperature: 0.7,
                messages: [
                    { role: 'system', content: 'Return ONLY valid JSON with shape {"prompts": string[]} — no prose, no code fences.' },
                    { role: 'user', content: userPrompt }
                ],
                stream: false
            }, { headers });
            const content2 = resp2.data?.choices?.[0]?.message?.content;
            const stripped2 = String(content2 || '').replace(/^```(?:json)?\n|```$/g, '').trim();
            const parsed2 = JSON.parse(stripped2);
            const prompts2 = Array.isArray(parsed2?.prompts) ? parsed2.prompts : [];
            return res.json({ prompts: prompts2 });
        } catch (err2) {
            return res.status(500).json({ error: `Prompt generation failed: ${err2?.response?.data?.error?.message || err2.message}` });
        }
    }
});

// Endpoint to send concurrent requests
app.post('/api/test-concurrency', async (req, res) => {
    const { prompts, apiUrl, apiKey, model, maxTokens, concurrency } = req.body;

    if (!Array.isArray(prompts) || prompts.length === 0 || !apiUrl || !apiKey || !model) {
        return res.status(400).json({ error: 'Missing required fields: prompts[], apiUrl, apiKey, model' });
    }

    // Default max tokens to a large value unless provided
    const maxTokensValue = maxTokens || 10000;
    const count = prompts.length;
    // Interpret concurrency: 0 means "all prompts at once" per user request.
    const concurrencyNum = Number.isFinite(Number(concurrency)) ? Number(concurrency) : 0;
    let maxParallel;
    if (concurrencyNum === 0) {
        maxParallel = count; // all at once
    } else {
        // clamp between 1 and count
        maxParallel = Math.max(1, Math.min(count, Math.floor(concurrencyNum)));
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');

    // Request runner with bounded concurrency
    let next = 0;
    let running = 0;
    let completed = 0;
    await new Promise((resolveAll) => {
        const launchNext = () => {
            while (running < maxParallel && next < count) {
                const idx = next++;
                const requestId = idx + 1;
                const contentPrompt = String(prompts[idx]);
                running++;
                res.write(JSON.stringify({ id: requestId, status: 'started', prompt: contentPrompt }) + '\n');

                axios.post(`${apiUrl}/v1/chat/completions`, {
                    model: model,
                    messages: [{ role: 'user', content: contentPrompt }],
                    max_tokens: maxTokensValue,
                    stream: true
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream'
                }).then(response => new Promise((resolve, reject) => {
                    let content = '';
                    let totalTokens = 0;
                    const startTime = Date.now();
                    let firstTokenTime = null;
                    const stream = response.data;
                    stream.on('data', (chunk) => {
                        const lines = chunk.toString().split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const data = line.slice(6);
                                if (data === '[DONE]') {
                                    const endTime = Date.now();
                                    const duration = (endTime - (firstTokenTime || startTime)) / 1000;
                                    const tokensPerSecond = duration > 0 ? totalTokens / duration : 0;
                                    resolve({ id: requestId, status: 'success', prompt: contentPrompt, generatedText: content.trim(), totalTokens, tokensPerSecond });
                                    return;
                                }
                                try {
                                    const parsed = JSON.parse(data);
                                    if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                        if (firstTokenTime === null) firstTokenTime = Date.now();
                                        content += parsed.choices[0].delta.content;
                                        totalTokens++;
                                    }
                                } catch (_) { /* ignore */ }
                            }
                        }
                    });
                    stream.on('end', () => {
                        const endTime = Date.now();
                        const duration = (endTime - (firstTokenTime || startTime)) / 1000;
                        const tokensPerSecond = duration > 0 ? totalTokens / duration : 0;
                        resolve({ id: requestId, status: 'success', prompt: contentPrompt, generatedText: content.trim(), totalTokens, tokensPerSecond });
                    });
                    stream.on('error', (error) => {
                        reject({ id: requestId, status: 'error', prompt: contentPrompt, error: error.message });
                    });
                })).catch(err => err).then(result => {
                    res.write(JSON.stringify(result) + '\n');
                    running--;
                    completed++;
                    if (completed >= count && running === 0) {
                        resolveAll();
                    } else {
                        launchNext();
                    }
                });
            }
        };
        launchNext();
    });
    res.end();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});