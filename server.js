require('dotenv').config();

const express = require('express');
const path    = require('path');
const http    = require('http');
const cors    = require('cors');
const { Octokit } = require('@octokit/rest');
const { analyzeMessages } = require('./src/analyzer');

const app  = express();
const PORT = process.env.PORT || 3000;

// GitHub Repository configuration
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const REPO_OWNER = 'toxic-clang-hosting';
const REPO_NAME  = 'toxic-lang-detector';

// Server-side credentials — always override whatever the client sends
const SERVER_SETTINGS = {
  provider: process.env.PROVIDER || 'openai',
  model:    process.env.MODEL    || 'gpt-4o',
  apiKey:   process.env.API_KEY,
};

if (!SERVER_SETTINGS.apiKey) {
  console.error('ERROR: API_KEY is not set in .env');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'renderer')));

// AI Text Analysis Endpoint
app.post('/api/analyze', async (req, res) => {
  const { messages, settings } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ ok: false, error: 'messages must be a non-empty array' });
  try {
    // Merge: client may pass delayMs preference, but credentials always come from server
    const mergedSettings = { ...settings, ...SERVER_SETTINGS };
    const results = await analyzeMessages(messages, mergedSettings);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Minimal Log Offloading Endpoint
app.post('/api/save-logs', async (req, res) => {
  try {
    const { survey1_id, condition, chatlog } = req.body ?? {};

    if (!survey1_id) {
      return res.status(400).json({ ok: false, error: 'Missing survey1_id parameter' });
    }

    // Strictly restrict saved payload to survey1_id, condition, and compressed chatlog
    const minimalPayload = {
      survey1_id: survey1_id,
      condition: condition || 'unknown',
      chatlog: chatlog || ''
    };

    const filePath = `logs/${survey1_id}_${Date.now()}.json`;
    const payloadString = JSON.stringify(minimalPayload, null, 2);
    const contentBase64 = Buffer.from(payloadString).toString('base64');

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      message: `Save minimal logs for user ${survey1_id}`,
      content: contentBase64,
      branch: 'main'
    });

    console.log(`Minimal log saved to GitHub: ${filePath}`);
    return res.json({ ok: true, path: filePath });

  } catch (error) {
    console.error('Error committing to GitHub:', error);
    return res.status(500).json({ ok: false, error: 'Failed to save log', details: error.message });
  }
});

const server = http.createServer(app);
server.timeout = 300000; // 5 min — allows queued requests to wait without timing out

// Run standalone: node server.js
if (require.main === module) {
  server.listen(PORT, () =>
    console.log(`Toxic Language Detector → http://localhost:${PORT}`)
  );
}

module.exports = { server, PORT };
