const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint to send concurrent requests
app.post('/api/test-concurrency', async (req, res) => {
    const { prompt, numRequests, apiUrl, apiKey, model, maxTokens } = req.body;

    if (!prompt || !numRequests || !apiUrl || !apiKey || !model) {
        return res.status(400).json({ error: 'Missing required fields: prompt, numRequests, apiUrl, apiKey, model' });
    }

    const maxTokensValue = maxTokens || 100;

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');

    const requests = [];
    for (let i = 0; i < numRequests; i++) {
        res.write(JSON.stringify({ id: i + 1, status: 'started' }) + '\n');
        const promise = axios.post(`${apiUrl}/v1/chat/completions`, {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokensValue
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        }).then(response => ({
            id: i + 1,
            status: 'success',
            result: response.data.choices[0].message.content
        })).catch(error => ({
            id: i + 1,
            status: 'error',
            result: error.message
        })).then(result => {
            res.write(JSON.stringify(result) + '\n');
            return result;
        });
        requests.push(promise);
    }

    await Promise.all(requests);
    res.end();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});