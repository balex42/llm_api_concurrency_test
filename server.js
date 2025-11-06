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
            max_tokens: maxTokensValue,
            stream: true
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        }).then(response => {
            return new Promise((resolve, reject) => {
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
                                const duration = (endTime - (firstTokenTime || startTime)) / 1000; // seconds
                                const tokensPerSecond = duration > 0 ? totalTokens / duration : 0;
                                
                                resolve({
                                    id: i + 1,
                                    status: 'success',
                                    generatedText: content.trim(),
                                    totalTokens: totalTokens,
                                    tokensPerSecond: tokensPerSecond
                                });
                                return;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                    if (firstTokenTime === null) {
                                        firstTokenTime = Date.now();
                                    }
                                    content += parsed.choices[0].delta.content;
                                    totalTokens++;
                                }
                            } catch (e) {
                                // Ignore parsing errors for now
                            }
                        }
                    }
                });
                stream.on('end', () => {
                    const endTime = Date.now();
                    const duration = (endTime - (firstTokenTime || startTime)) / 1000; // seconds
                    const tokensPerSecond = duration > 0 ? totalTokens / duration : 0;
                    
                    resolve({
                        id: i + 1,
                        status: 'success',
                        generatedText: content.trim(),
                        totalTokens: totalTokens,
                        tokensPerSecond: tokensPerSecond
                    });
                });
                stream.on('error', (error) => {
                    reject({
                        id: i + 1,
                        status: 'error',
                        error: error.message
                    });
                });
            });
        }).catch(error => ({
            id: i + 1,
            status: 'error',
            error: error.message
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