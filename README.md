# Concurrency Test App

Generate prompts with an LLM (structured output) and run concurrent chat completions against any OpenAI‑compatible API, with live streaming results and throughput stats.

## Setup

1) Install dependencies

```
npm install
```

2) Start the server

```
npm start
```

3) Open your browser at http://localhost:3000

## What it does

- Generates a list of prompts via LLM using structured JSON output (with a graceful fallback if schema is unsupported). You can now request up to 500 prompts in one generation batch.
- Sends one concurrent request per prompt to `/v1/chat/completions` and streams results live
- Shows per‑request status, prompt snippet, last part of the generated text, tokens/s, and total “tokens” count
- Right‑click any row to view the full prompt and output in a scrollable modal and copy either to clipboard

Note: The “tokens” and “tokens/s” shown are based on streamed content deltas and are an approximation, not an exact tokenizer count.

## Usage

1) Enter your API URL (e.g., https://api.openai.com) and Model (e.g., gpt-4o, gpt-3.5-turbo, qwen2.5, etc.)
2) Enter your API Key
3) In “Generate Prompts”, provide instructions and a number of prompts, then click “Generate Prompts”
   - You can edit the generated prompts directly in the textarea
   - Optional: check “Append \no_think” to add a newline + `\no_think` to each prompt (useful to disable reasoning on Qwen models)
4) Set “Max Tokens”
5) Click “Start Test with Generated Prompts”

The table updates in real time as each request streams:
- Request ID
- Status badge (started, success, error)
- Prompt (first 100 chars)
- Generated Text (last 100 chars)
- Tokens/s (approx.)
- Total Tokens (approx.)

Right‑click a row to open a modal showing the full prompt and full generated text with independent scrolling and copy buttons.

## API compatibility

This app targets OpenAI‑compatible chat completions endpoints:
- Path: `/v1/chat/completions`
- Request shape: `{ model, messages, max_tokens, stream }`

Prompt generation uses structured outputs when supported:
- Preferred: `response_format: { type: 'json_schema', json_schema: ... }`
- Fallback: a strict JSON response (`{"prompts": string[]}`) without code fences

## Backend endpoints

- POST `/api/generate-prompts`
  - Body: `{ apiUrl, apiKey, model, instructions, numPrompts }`
  - Returns: `{ prompts: string[] }`

- POST `/api/test-concurrency` (streams NDJSON)
  - Body: `{ prompts: string[], apiUrl, apiKey, model, maxTokens }`
  - Streamed events (per request):
    - `{ id, status: 'started', prompt }`
    - `{ id, status: 'success', prompt, generatedText, tokensPerSecond, totalTokens }`
    - `{ id, status: 'error', prompt, error }`

## Notes

- Concurrency equals the number of prompts you provide. You can tune parallelism separately with the Concurrency field (default: 0 — meaning "all prompts at once"). If you generate hundreds of prompts, they will be processed in waves when a positive concurrency value is supplied, otherwise the app will attempt to open all streams simultaneously.

Defaults:
- Concurrency: 0 (all prompts at once)
- Max Tokens: 10000 (unless you override it)

Safety note:
- Large batches can trigger provider rate limits or timeouts. If you see errors or slowdowns, reduce Concurrency or split batches. As a rule of thumb, keep prompts <= Concurrency × 5 per run for best stability.
- Use the “Append \no_think” checkbox to inhibit reasoning on Qwen models by appending a newline + `\no_think` to each prompt.
- Hovering over the prompt or generated text cells shows a tooltip with the full content; use right‑click for the scrollable modal.