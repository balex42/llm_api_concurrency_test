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

## Docker / Podman

I added a `Dockerfile` at the repository root so you can build and run the app in a container. The image exposes port 3000 (the app default).

Build with Podman (local):

```bash
# build local image
podman build -t llm_api_concurrency_test:latest -f Dockerfile .

# run the container and map port 3000
podman run --rm -p 3000:3000 -e PORT=3000 llm_api_concurrency_test:latest
```

If you want to push/pull from GitHub Container Registry (GHCR):

```bash
# tag the image for GHCR (replace <OWNER> and <REPO> as needed)
podman tag llm_api_concurrency_test:latest ghcr.io/<OWNER>/<REPO>:latest

# login to ghcr using a PAT with `write:packages` and `read:packages` (recommended) or use a token stored in $CR_PAT
echo $CR_PAT | podman login ghcr.io -u <USERNAME> --password-stdin

# push
podman push ghcr.io/<OWNER>/<REPO>:latest

# run pulled image
podman run --rm -p 3000:3000 ghcr.io/<OWNER>/<REPO>:latest
```

Notes:
- The `Dockerfile` uses Node 18 (alpine) and runs `node server.js`.
- The app listens on port 3000 by default; you can override the `PORT` env when running the container.

## Automated builds and GHCR (GitHub Container Registry)

A GitHub Actions workflow has been added at `.github/workflows/ghcr.yml`. It builds the container and pushes it to GHCR on pushes to the `main` branch (and can also be triggered manually).

What the workflow does:
- Checks out the repo
- Sets up buildx and QEMU for multi-platform builds
- Logs into `ghcr.io` using `GITHUB_TOKEN`
- Builds and pushes image tags: `ghcr.io/<owner>/<repo>:latest` and `ghcr.io/<owner>/<repo>:<sha>`

Configuration / permissions you may need:

1. Repository permissions: Go to Settings → Actions → General and ensure "Workflow permissions" allows workflows to read and write (so the provided `GITHUB_TOKEN` can push to packages). Set "Read and write permissions" for the token.
2. Packages permissions: In some organizations you may need to allow GitHub Actions to publish packages. Check Settings → Packages / Package settings for repository/org-level controls.
3. If `GITHUB_TOKEN` does not meet your policy or you prefer a PAT, create a Personal Access Token with at least `write:packages` and `read:packages`, then add it to repo Secrets (for example `GHCR_TOKEN`) and update the workflow to use that secret instead of `GITHUB_TOKEN` for `docker/login-action`.

Example of swapping to a PAT in the workflow:

```yaml
      - name: Log in to GHCR
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GHCR_TOKEN }}
```

If you want me to customize the workflow (add tags, releases, branch filters, or upload the image on tags only), tell me how you'd like it to behave and I can update the workflow.

## Running the container on startup (systemd)

Below are two approaches to run the container on system startup. Option A (recommended) uses Podman's built-in systemd unit generator which creates a standard systemd service. Option B shows a minimal "quadlet"-style unit you can use if you have `quadlet` installed — verify your distribution's quadlet implementation and adjust keys as needed.

Important: these examples assume you have built and pushed the image to `ghcr.io/<OWNER>/<REPO>:latest` (or you can use a local image name). Replace `<OWNER>/<REPO>` and `<USERNAME>` where appropriate.

### A) Recommended — use podman generate systemd (works without quadlet)

1. Pull or build the image locally (example using Podman):

```bash
podman pull ghcr.io/<OWNER>/<REPO>:latest
```

2. Generate a systemd unit and install it (replace service name as desired):

```bash
# generate a unit named llm_api_concurrency_test.service in the current directory
podman generate systemd --name llm_api_concurrency_test --new --files --restart-policy=always ghcr.io/<OWNER>/<REPO>:latest

# move the generated unit to systemd's unit directory and enable it
sudo mv container-llm_api_concurrency_test.service /etc/systemd/system/llm_api_concurrency_test.service
sudo systemctl daemon-reload
sudo systemctl enable --now llm_api_concurrency_test.service
```

3. Verify the service status and logs:

```bash
sudo systemctl status llm_api_concurrency_test.service
sudo journalctl -u llm_api_concurrency_test.service -f
```

The generated unit runs the container via Podman and will restart it according to the specified restart policy.

### B) Quadlet (example)

If you prefer `quadlet` (unit generator that accepts `.container` files), create a file named `/etc/systemd/system/llm_api_concurrency_test.container` with contents similar to the example below. Exact key names and behavior depend on your quadlet implementation/version — check your distro docs if something needs adjusting.

Create `/etc/systemd/system/llm_api_concurrency_test.container` with:

```ini
[Unit]
Description=LLM API Concurrency Test (container via quadlet)
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/<OWNER>/<REPO>:latest
Restart=always
Environment=PORT=3000
# Optionally add any env var the app needs, e.g. API_URL or other secrets via systemd secrets

[Service]
# Optional: ensure Podman pulls latest image before start
ExecStartPre=/usr/bin/podman pull ghcr.io/<OWNER>/<REPO>:latest
# The actual runtime invocation will be generated by quadlet
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now llm_api_concurrency_test.container
sudo systemctl status llm_api_concurrency_test.container
```

Notes about quadlet:
- Quadlet implementations vary; some accept a `.container` file in `/etc/systemd/system/` and translate it into a full service. The example above is intentionally minimal — consult your quadlet installation docs for supported keys (for example, how to map ports, volumes, or secrets).
- If quadlet on your system doesn't provide automatic port mapping, you can still use a hand-written systemd service that runs `podman run` directly (see the `podman generate systemd` option above, or the manual unit example below).

### C) Manual systemd unit (simple fallback)

If you don't want to rely on generators, create a plain systemd service that runs Podman directly. Create `/etc/systemd/system/llm_api_concurrency_test.service` with:

```ini
[Unit]
Description=LLM API Concurrency Test (Podman)
After=network-online.target
Wants=network-online.target

[Service]
Restart=always
Environment=PORT=3000
ExecStart=/usr/bin/podman run --name llm_api_concurrency_test --rm -p 3000:3000 -e PORT=3000 ghcr.io/<OWNER>/<REPO>:latest
ExecStop=/usr/bin/podman stop -t 10 llm_api_concurrency_test
KillMode=control-group
Type=simple

[Install]
WantedBy=multi-user.target
```

Enable and start it the same way:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now llm_api_concurrency_test.service
```

Security considerations
- For production, avoid embedding secrets directly in unit files. Use systemd `EnvironmentFile=`, Podman's support for secrets, or provide secrets via a secret management solution.
- Ensure only trusted users can edit systemd unit files and that your PATs / tokens are stored as secrets in your container registry or via systemd secret mechanisms.

If you want, I can:
- Produce the exact unit file tailored to your environment (image name, port, env vars, volumes).
- Add a small health-check target that restarts the service when the app doesn't respond on /.
- Add an example `EnvironmentFile` to keep secrets out of the unit file.

Tell me which you'd prefer and I will add the exact unit file content to the repo.