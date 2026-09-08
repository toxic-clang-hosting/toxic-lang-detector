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

// Append all overflow logs into a single CSV sheet on GitHub
app.post('/api/save-logs', async (req, res) => {
  try {
    const { survey1_id, condition, chatlog } = req.body ?? {};

    if (!survey1_id) {
      return res.status(400).json({ ok: false, error: 'Missing survey1_id parameter' });
    }

    const FILE_PATH = 'logs/overflow_logs.csv';
    const timestamp = new Date().toISOString();

    // Utility to format values safely for CSV columns
    const safeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
    const newRow = `${safeCsv(survey1_id)},${safeCsv(condition)},${safeCsv(timestamp)},${safeCsv(chatlog)}\n`;

    let fileSha;
    let existingContent = 'survey1_id,condition,timestamp,chatlog\n'; // Header for new file

    // Check if the CSV file already exists on GitHub
    try {
      const { data } = await octokit.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: FILE_PATH,
      });
      fileSha = data.sha;
      existingContent = Buffer.from(data.content, 'base64').toString('utf-8');
    } catch (err) {
      if (err.status !== 404) throw err; // Re-throw if error is not 'File Not Found'
    }

    // Append new participant row to the sheet
    const updatedContent = existingContent + newRow;
    const contentBase64 = Buffer.from(updatedContent).toString('base64');

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: FILE_PATH,
      message: `Append overflow log for user ${survey1_id}`,
      content: contentBase64,
      sha: fileSha, // Required by GitHub API when updating an existing file
      branch: 'main'
    });

    console.log(`Appended entry for ${survey1_id} to ${FILE_PATH}`);
    return res.json({ ok: true, path: FILE_PATH });

  } catch (error) {
    console.error('Error updating CSV on GitHub:', error);
    return res.status(500).json({ ok: false, error: 'Failed to update sheet', details: error.message });
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
