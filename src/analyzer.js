// ── 3-layer antisocial language analysis pipeline ───────────────────────────

const { callLLM } = require('./llm-client');
const {
  LAYER1_SYSTEM,
  LAYER2_SYSTEM,
  LAYER3_SYSTEM,
  COMBINED_SYSTEM,
  buildLayer1Prompt,
  buildLayer2Prompt,
  buildLayer3Prompt,
  buildCombinedPrompt,
} = require('./prompts');

const FAST_MODE = process.env.FAST_MODE === 'true';

function normalizeDecision(result) {
  const { layer1, layer2, layer3 } = result;
  if (typeof layer1?.harm_candidate !== 'boolean' || !layer3 || typeof layer3 !== 'object') {
    throw new Error('Incomplete model analysis');
  }
  if (!layer1.harm_candidate) {
    result.layer2 = {
      target_analysis: 'No harmful expression detected.',
      override: 'CLEAR_ALL',
      rule_applied: 'B',
      adjusted_categories: [],
      policy_reason: 'Layer 1 found no harm candidate.',
      adjusted_confidence: 0,
    };
  } else if (!['KEEP', 'DOWNGRADE', 'CLEAR_ALL'].includes(layer2?.override)) {
    throw new Error('Invalid policy override from model');
  }

  const intervene = layer1.harm_candidate && result.layer2.override === 'KEEP';
  layer3.verdict = intervene ? 'HARMFUL' : 'SAFE';
  layer3.action = intervene ? 'RECOMMEND' : 'NO_ACTION';
  if (!intervene) {
    layer3.recommended_report_categories = [];
    layer3.replacement_suggestion = null;
    delete layer3.suggestion_fallback;
  } else {
    if (!Array.isArray(layer3.recommended_report_categories)) {
      throw new Error('Missing report categories from model');
    }
    if (typeof layer3.replacement_suggestion !== 'string' || !layer3.replacement_suggestion.trim()) {
      const original = String(result.message ?? '');
      const fallback = "let's keep playing";
      layer3.replacement_suggestion = original === original.toUpperCase() && /[A-Z]/.test(original)
        ? fallback.toUpperCase()
        : fallback;
      layer3.suggestion_fallback = true;
    }
  }
  return result;
}

/**
 * Analyze a single message — fast mode (1 API call) or standard (3 API calls).
 */
async function analyzeOne(message, context, settings) {
  if (FAST_MODE) {
    const result = await callLLM({
      ...settings,
      system: COMBINED_SYSTEM,
      user: buildCombinedPrompt(message, context),
    });
    return normalizeDecision({ message, layer1: result.layer1, layer2: result.layer2, layer3: result.layer3 });
  }

  // Standard 3-call pipeline
  const layer1 = await callLLM({
    ...settings,
    system: LAYER1_SYSTEM,
    user: buildLayer1Prompt(message, context),
  });

  let layer2;
  if (layer1.harm_candidate) {
    layer2 = await callLLM({
      ...settings,
      system: LAYER2_SYSTEM,
      user: buildLayer2Prompt(message, layer1, context),
    });
  } else {
    layer2 = {
      override: 'CLEAR_ALL',
      adjusted_categories: [],
      policy_reason: 'No harm detected in Layer 1; skipping edge-case filter.',
      adjusted_confidence: 0,
    };
  }

  const layer3 = await callLLM({
    ...settings,
    system: LAYER3_SYSTEM,
    user: buildLayer3Prompt(message, layer1, layer2, context),
  });

  return normalizeDecision({ message, layer1, layer2, layer3 });
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

module.exports = { analyzeOne, analyzeMessages, normalizeDecision };
