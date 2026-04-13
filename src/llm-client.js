// ── Unified LLM client for OpenAI, Anthropic, Google Gemini ─────────────────

// ── Concurrency limiter — prevents simultaneous users from flooding the API ──
const MAX_CONCURRENT = 3;
let _active = 0;
const _queue = [];

function acquireSemaphore() {
  return new Promise(resolve => {
    if (_active < MAX_CONCURRENT) { _active++; resolve(); }
    else _queue.push(resolve);
  });
}

function releaseSemaphore() {
  _active--;
  if (_queue.length > 0) { _active++; _queue.shift()(); }
}

// ── Auto-retry with exponential backoff on rate-limit errors ─────────────────
async function withRetry(fn, retries = 4, baseDelayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 429
        || String(err.message).includes('429')
        || String(err.message).toLowerCase().includes('quota')
        || String(err.message).toLowerCase().includes('rate limit');
      if (!isRateLimit || i === retries - 1) throw err;
      const wait = baseDelayMs * Math.pow(2, i);
      console.warn(`Rate limit hit — retrying in ${wait}ms (attempt ${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Call an LLM and get a JSON response.
 * @param {object} opts
 * @param {string} opts.provider  - 'openai' | 'anthropic' | 'google'
 * @param {string} opts.model     - model ID string
 * @param {string} opts.apiKey
 * @param {string} opts.system    - system prompt
 * @param {string} opts.user      - user prompt
 * @returns {Promise<object>}     - parsed JSON object
 */
async function callLLM({ provider, model, apiKey, system, user }) {
  await acquireSemaphore();
  try {
    return await withRetry(() => {
      switch (provider) {
        case 'openai':    return callOpenAI({ model, apiKey, system, user });
        case 'anthropic': return callAnthropic({ model, apiKey, system, user });
        case 'google':    return callGoogle({ model, apiKey, system, user });
        default:          throw new Error(`Unknown provider: ${provider}`);
      }
    });
  } finally {
    releaseSemaphore();
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
async function callOpenAI({ model, apiKey, system, user }) {
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  return JSON.parse(response.choices[0].message.content);
}

// ── Anthropic ────────────────────────────────────────────────────────────────
async function callAnthropic({ model, apiKey, system, user }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0,
  });

  const text = response.content[0].text;
  // Extract JSON from response (may or may not be wrapped in markdown)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Anthropic returned no JSON object');
  return JSON.parse(match[0]);
}

// ── Google Gemini ─────────────────────────────────────────────────────────────
async function callGoogle({ model, apiKey, system, user }) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  const gemini = genAI.getGenerativeModel({
    model,
    systemInstruction: system,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const result = await gemini.generateContent(user);
  const text = result.response.text();
  return JSON.parse(text);
}

module.exports = { callLLM };
