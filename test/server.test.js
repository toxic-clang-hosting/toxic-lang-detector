const assert = require('node:assert/strict');
const test = require('node:test');
const { server } = require('../server');

test('analysis endpoint rejects malformed or unbounded requests before any model call', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/analyze`;
    for (const body of [
      { messages: [null] },
      { messages: [{ message: '' }] },
      { messages: [{ message: 'hello', context: 1 }] },
      { messages: [{ message: 'hello' }], settings: { delayMs: -1 } },
      { messages: [{ message: 'hello' }], settings: { delayMs: '100' } },
    ]) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal((await response.json()).ok, false);
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
