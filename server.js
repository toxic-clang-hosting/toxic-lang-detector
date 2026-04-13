require('dotenv').config();

const express = require('express');
const path    = require('path');
const http    = require('http');
const { analyzeMessages } = require('./src/analyzer');

const app  = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'renderer')));

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

const server = http.createServer(app);
server.timeout = 300000; // 5 min — allows queued requests to wait without timing out

// Run standalone: node server.js
if (require.main === module) {
  server.listen(PORT, () =>
    console.log(`Toxic Language Detector → http://localhost:${PORT}`)
  );
}

module.exports = { server, PORT };
