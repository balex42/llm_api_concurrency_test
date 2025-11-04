# Concurrency Test App

This application tests the concurrency of an OpenAI-compatible inference server API.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

3. Open your browser and go to `http://localhost:3000`

## Usage

- Enter the API URL (e.g., https://api.openai.com)
- Enter your API key
- Enter a prompt
- Specify the number of concurrent requests
- Select the model to use (e.g., gpt-3.5-turbo, gpt-4)
- Specify the maximum number of tokens for responses (default: 100)
- Click "Start Test" to send the requests and view the results in the table

## Features

- Sends multiple concurrent requests to the API
- Displays real-time status updates for each request (started, success, error)
- Allows selection of different models
- Allows customization of max tokens for API responses
- Simple web UI for easy testing