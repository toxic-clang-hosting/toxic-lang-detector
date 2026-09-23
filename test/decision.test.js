const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeDecision } = require('../src/analyzer');
const { buildLayer2Prompt, buildLayer3Prompt, LAYER2_SYSTEM, COMBINED_SYSTEM } = require('../src/prompts');

function result(harmCandidate, override, suggestion = 'can you help us?') {
  return {
    message: 'example',
    layer1: { harm_candidate: harmCandidate },
    layer2: { override },
    layer3: {
      verdict: 'HARMFUL',
      action: 'RECOMMEND',
      recommended_report_categories: ['verbal abuse'],
      replacement_suggestion: suggestion,
    },
  };
}

test('KEEP recommends; DOWNGRADE and CLEAR_ALL do not', () => {
  const keep = normalizeDecision(result(true, 'KEEP'));
  assert.equal(keep.layer3.action, 'RECOMMEND');
  assert.equal(keep.layer3.verdict, 'HARMFUL');
  for (const override of ['DOWNGRADE', 'CLEAR_ALL']) {
    const safe = normalizeDecision(result(true, override));
    assert.equal(safe.layer3.action, 'NO_ACTION');
    assert.equal(safe.layer3.verdict, 'SAFE');
    assert.deepEqual(safe.layer3.recommended_report_categories, []);
    assert.equal(safe.layer3.replacement_suggestion, null);
  }
});

test('no detected harm and invalid policy results cannot become interventions', () => {
  const safe = normalizeDecision(result(false, 'KEEP'));
  assert.equal(safe.layer2.override, 'CLEAR_ALL');
  assert.equal(safe.layer3.action, 'NO_ACTION');
  assert.throws(() => normalizeDecision(result(true, 'MAYBE')), /Invalid policy override/);
  const fallback = normalizeDecision(result(true, 'KEEP', null));
  assert.equal(fallback.layer3.action, 'RECOMMEND');
  assert.equal(fallback.layer3.replacement_suggestion, "let's keep playing");
  assert.equal(fallback.layer3.suggestion_fallback, true);
});

test('both modes share the decision policy and later standard stages receive context', () => {
  assert.match(LAYER2_SYSTEM, /Intervene only for KEEP/);
  assert.match(COMBINED_SYSTEM, /Intervene only for KEEP/);
  assert.match(buildLayer2Prompt('reply', {}, 'them: hello'), /them: hello/);
  assert.match(buildLayer3Prompt('reply', {}, {}, 'them: hello'), /them: hello/);
});
