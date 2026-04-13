# Toxic Language Detector

A web-based tool for detecting toxic and antisocial language in online games using a 3-layer LLM analysis pipeline.

## How It Works

Messages are analyzed through three layers:

1. **Layer 1 — Category Detection**: Identifies if the message falls into any harmful categories (Verbal Harassment, Identity-Based Attack, Threat/Intimidation, Verbal Griefing)
2. **Layer 2 — Edge-Case Policy Filter**: Applies nuanced rules to handle ambiguous cases (e.g. self-directed frustration vs. targeted insults)
3. **Layer 3 — Final Decision**: Issues a verdict (`HARMFUL` / `SAFE`), recommends a report category, and suggests a replacement message if applicable

## Setup Instructions

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- An API key from one of the supported LLM providers:
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Anthropic](https://console.anthropic.com/)
  - [Google Gemini](https://aistudio.google.com/app/apikeys)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Your API Key

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then open `.env` and fill in your credentials:

```
PROVIDER=openai          # openai | anthropic | google
MODEL=gpt-4o             # model ID for your chosen provider
API_KEY=sk-...           # your API key
```

**Supported models:**
| Provider | Example Models |
|----------|---------------|
| OpenAI | `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| Anthropic | `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307` |
| Google | `gemini-1.5-pro`, `gemini-1.5-flash` |

### 3. Start the Server

```bash
npm run web
```

The app will be available at **http://localhost:3000**

---

## Usage

### Single Message Analysis
1. Type a message in the **Message** box
2. Optionally add game context in the **Context** box
3. Click **Analyze**

### Batch CSV Analysis
1. Prepare a CSV file with columns: `message` (required), `context` (optional)
2. Click **Load CSV** and select your file
3. Click **Analyze All**
4. Export results via **Export CSV**

---

## Making It Publicly Accessible (Optional)

To share the tool with others via a public URL, use [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):

```bash
# Install cloudflared (macOS)
brew install cloudflared

# Start tunnel (run after npm run web)
cloudflared tunnel --url http://localhost:3000
```

A public URL like `https://xxxx-xxxx.trycloudflare.com` will be printed — share it with your team. Note: the URL changes each time you restart the tunnel.

---

## Project Structure

```
toxic_language/
├── server.js          # Express server + API endpoint
├── main.js            # Electron entry point (optional desktop mode)
├── src/
│   ├── prompts.js     # Layer 1/2/3 system prompts
│   ├── llm-client.js  # Unified OpenAI/Anthropic/Google client
│   └── analyzer.js    # 3-layer pipeline orchestrator
├── renderer/
│   ├── index.html     # App UI
│   ├── styles.css     # Dark theme styles
│   └── renderer.js    # Frontend logic
├── .env.example       # API key template
└── package.json
```

---

## Security Notes

- Your API key lives only in `.env` and is **never** sent to the browser
- `.env` is excluded from version control via `.gitignore`
- All LLM calls are made server-side
