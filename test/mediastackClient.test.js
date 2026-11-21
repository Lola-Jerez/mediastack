// My tests for the API client. I use a FAKE fetch so I never call the real
// API in tests (that would waste my free monthly quota).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediastackClient } from '../src/api/mediastackClient.js';

// I build a fake HTTP response that looks like the real fetch Response.
function fakeResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
  };
}

// I create a client with tiny delays so my tests run fast.
function makeClient(responses) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const client = createMediastackClient({
    apiKey: 'test-key',
    baseUrl: 'http://api.mediastack.com/v1',
    timeoutMs: 1000,
    maxRetries: 3,
    minDelayBetweenRequestsMs: 0,
    retryBaseDelayMs: 1,
    fetchFn,
    log: () => {},
  });
  return { client, calls };
}

test('I retry on a 500 error and then succeed', async () => {
  const { client, calls } = makeClient([
    fakeResponse(500, { error: { code: 'internal_error', message: 'oops' } }),
    fakeResponse(200, { data: [{ title: 'ok' }] }),
  ]);
  const body = await client.fetchNews({ limit: 10 });
  assert.equal(body.data[0].title, 'ok');
  assert.equal(calls.length, 2);
});

test('I retry when the request times out', async () => {
  const timeout = new Error('timed out');
  timeout.name = 'TimeoutError';
  const { client, calls } = makeClient([timeout, fakeResponse(200, { data: [] })]);
  await client.fetchNews({ limit: 10 });
  assert.equal(calls.length, 2);
});

test('I do NOT retry when my API key is wrong', async () => {
  const { client, calls } = makeClient([
    fakeResponse(401, { error: { code: 'invalid_access_key', message: 'bad key' } }),
  ]);
  await assert.rejects(client.fetchNews({ limit: 10 }), { code: 'invalid_access_key' });
  assert.equal(calls.length, 1);
});

test('I do NOT retry when my monthly quota is used up', async () => {
  const { client, calls } = makeClient([
    fakeResponse(429, { error: { code: 'usage_limit_reached', message: 'quota' } }),
  ]);
  await assert.rejects(client.fetchNews({ limit: 10 }), { code: 'usage_limit_reached' });
  assert.equal(calls.length, 1);
});

test('I give up after maxRetries temporary failures', async () => {
  const fail = () => fakeResponse(503, {});
  const { client, calls } = makeClient([fail(), fail(), fail(), fail()]);
  await assert.rejects(client.fetchNews({ limit: 10 }), { status: 503 });
  assert.equal(calls.length, 4); // 1 try + 3 retries
});

test('I only send filters that have a value', async () => {
  const { client, calls } = makeClient([fakeResponse(200, { data: [] })]);
  await client.fetchNews({ limit: 5, languages: 'en', countries: '' });
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('languages'), 'en');
  assert.equal(url.searchParams.has('countries'), false);
});
