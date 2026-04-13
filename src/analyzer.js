// ── 3-layer antisocial language analysis pipeline ───────────────────────────

const { callLLM } = require('./llm-client');
const {
  LAYER1_SYSTEM,
  LAYER2_SYSTEM,
  LAYER3_SYSTEM,
  buildLayer1Prompt,
  buildLayer2Prompt,
  buildLayer3Prompt,
} = require('./prompts');

/**
 * Analyze a single message through all 3 layers.
 * @param {string} message
 * @param {string|null} context  - optional prior messages as plain text
 * @param {object} settings      - { provider, model, apiKey }
 * @returns {Promise<object>}    - { layer1, layer2, layer3, message }
 */
async function analyzeOne(message, context, settings) {
  // Layer 1
  const layer1 = await callLLM({
    ...settings,
    system: LAYER1_SYSTEM,
    user: buildLayer1Prompt(message, context),
  });

  // Layer 2 – only if harm candidate
  let layer2;
  if (layer1.harm_candidate) {
    layer2 = await callLLM({
      ...settings,
      system: LAYER2_SYSTEM,
      user: buildLayer2Prompt(message, layer1),
    });
  } else {
    layer2 = {
      override: 'CLEAR_ALL',
      adjusted_categories: [],
      policy_reason: 'No harm detected in Layer 1; skipping edge-case filter.',
      adjusted_confidence: 0,
    };
  }

  // Layer 3 – always
  const layer3 = await callLLM({
    ...settings,
    system: LAYER3_SYSTEM,
    user: buildLayer3Prompt(message, layer1, layer2),
  });

  return { message, layer1, layer2, layer3 };
}

/**
 * Analyze an array of messages, with optional rate-limit delay between calls.
 * @param {Array<{message: string, context?: string}>} messages
 * @param {object} settings  - { provider, model, apiKey, delayMs? }
 * @returns {Promise<Array>}
 */
async function analyzeMessages(messages, settings) {
  const results = [];
  const delay = settings.delayMs ?? 300;

  for (const item of messages) {
    try {
      const result = await analyzeOne(item.message, item.context ?? null, settings);
      results.push({ ...result, error: null });
    } catch (err) {
      results.push({
        message: item.message,
        layer1: null,
        layer2: null,
        layer3: null,
        error: err.message,
      });
    }
    if (delay > 0) await sleep(delay);
  }

  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { analyzeOne, analyzeMessages };
