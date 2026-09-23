const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadStudy(page, fetch, compress = text => text) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', page), 'utf8');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, `${page} has an inline study script`);
  const elements = new Map();
  const timers = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        value: '', textContent: '', disabled: false, style: {},
        classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: name => classes.delete(name),
          contains: name => classes.has(name),
        },
        addEventListener() {}, focus() {}, appendChild() {},
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    URLSearchParams, Date, console: { error() {}, warn() {} }, fetch,
    LZString: { compressToEncodedURIComponent: compress },
    window: { location: { search: '' }, top: { location: { href: '' } } },
    document: { getElementById: element, createElement: () => element(`created-${elements.size}`) },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    setInterval: () => 1,
    clearInterval() {},
  });
  vm.runInContext(script, context, { filename: page });
  return { context, element, timers, logs: () => vm.runInContext('participantData.logs', context) };
}

const flagged = {
  message: 'original insult',
  layer3: { action: 'RECOMMEND', replacement_suggestion: 'can we try again?' },
};

for (const page of ['PDN.html', '2pdn.html']) {
  test(`${page} keeps participant analysis attached through an intervening bot message`, async () => {
    const study = loadStudy(page, async () => ({ ok: true, json: async () => ({ ok: true, results: [flagged] }) }));
    study.element('messageInput').value = flagged.message;
    await vm.runInContext('handleSend()', study.context);
    assert.equal(study.element('interventionModal').classList.contains('active'), true);

    const firstBotTimer = study.timers.length;
    vm.runInContext('scheduleBotMessages()', study.context);
    study.timers[firstBotTimer]();
    vm.runInContext(page === 'PDN.html' ? 'window.acceptSuggestion()' : 'window.cancelSend()', study.context);

    const logs = study.logs();
    assert.equal(logs[0].interactionType, 'bot_message');
    assert.equal(logs[0].api_data, null);
    assert.equal(logs[1].api_data.message, flagged.message);
  });

  test(`${page} records a per-result API error as an error`, async () => {
    const study = loadStudy(page, async () => ({ ok: true, json: async () => ({ ok: true, results: [{ error: 'provider failed' }] }) }));
    study.element('messageInput').value = 'hello';
    await vm.runInContext('handleSend()', study.context);
    assert.equal(study.logs()[0].interactionType, 'direct_send_api_error');
    assert.equal(study.logs()[0].api_data, null);
    assert.equal(study.logs()[0].analysis_error, 'provider failed');
  });
}

test('control records a send before scoring and updates that event', async () => {
  let resolveFetch;
  const study = loadStudy('3pdn.html', () => new Promise(resolve => { resolveFetch = resolve; }));
  study.element('messageInput').value = 'hello';
  const send = vm.runInContext('handleSend()', study.context);
  assert.equal(study.logs()[0].interactionType, 'control_pending');
  const timestamp = study.logs()[0].timestamp;
  resolveFetch({ ok: true, json: async () => ({ ok: true, results: [{ message: 'hello', layer3: { action: 'NO_ACTION' } }] }) });
  await send;
  assert.equal(study.logs()[0].interactionType, 'control_normal_send');
  assert.equal(study.logs()[0].timestamp, timestamp);
});

for (const page of ['PDN.html', '2pdn.html', '3pdn.html']) {
  test(`${page} preserves the remote survey and overflow-log handoff`, async () => {
    const requests = [];
    const study = loadStudy(page, async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true };
    }, () => 'x'.repeat(2100));
    await vm.runInContext('finishStudy()', study.context);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/save-logs');
    assert.equal(requests[0].body.chatlog.length, 2100);
    assert.match(study.context.window.top.location.href, /^https:\/\/usc\.qualtrics\.com\/jfe\/form\/SV_eA5NyF7paLrHvQq\?/);
    assert.match(study.context.window.top.location.href, /logs_saved_external=true/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'renderer', page), 'utf8'), /setTimeout\(finishStudy, 300000\)/);
  });
}
