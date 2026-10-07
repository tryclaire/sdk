import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { Claire, ClaireAPIError, ClaireResponseError } from '../dist/index.js';

const meta = { organizationId: '123e4567-e89b-12d3-a456-426614174000', freshness: { source: 'database', updatedAt: null, status: 'stale', note: 'Persisted only' } };
const page = { page: 2, pageSize: 20, total: 45, totalPages: 3, hasNextPage: true };
const envelope = (data, pagination) => ({ data, meta, ...(pagination === undefined ? {} : { pagination }) });

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}/api/v1`;
}

function json(res, data, status = 200, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

function client(baseUrl, options = {}) {
  return new Claire({ apiKey: 'test-secret', baseUrl, ...options });
}

test('routes all read resources, preserves exact query values and the server envelope', async (t) => {
  const requests = [];
  const baseUrl = await serve(t, (req, res) => {
    requests.push({ url: req.url, method: req.method, headers: req.headers });
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/v1/token') {
      json(res, envelope({ connected: true, token: null, index: null, holders: { count: 1, trackedBalanceRaw: '900719925474099312345678901234567890' }, latestFees: null, latestTradeAt: null, sources: { transfers: { updatedAt: null, status: 'stale' }, fees: { updatedAt: null, status: 'unavailable' } } }), 200, { 'x-request-id': 'token-request', etag: '"version-1"' });
    } else if (path.endsWith('/messages')) {
      json(res, envelope([{ id: 12, text: null }], { limit: 2, hasMore: true, nextBefore: 12, searchLimited: true }));
    } else if (path === '/api/v1/assets') {
      json(res, envelope([], { ...page, folderId: 'folder-1', folderName: 'Design' }));
    } else if (path === '/api/v1/context') {
      json(res, envelope({ organization: { id: meta.organizationId }, grantedScopes: ['context:read'], connections: {}, sources: [] }));
    } else if (path.startsWith('/api/v1/knowledge/')) {
      json(res, envelope({ id: 'docs:alpha/beta', content: 'part', contentRange: { offset: 0, length: 4, total: 9, nextOffset: 4 } }));
    } else if (path === '/api/v1/knowledge' || path === '/api/v1/telegram/chats' || path === '/api/v1/x/mentions') {
      json(res, envelope([], page));
    } else if (path.startsWith('/api/v1/assets/')) {
      json(res, envelope({ id: 'asset-1', publicUrl: null }));
    } else {
      res.writeHead(404).end();
    }
  });
  const sdk = client(baseUrl);
  const context = await sdk.context.get();
  const knowledge = await sdk.knowledge.list({ q: 'C++ & tea?', archived: false, page: 2, kind: 'note', visibility: 'team' });
  const item = await sdk.knowledge.get('docs:alpha/beta', { offset: 0, limit: 4 });
  const assets = await sdk.assets.list({ folderId: 'folder-1', page: 2 });
  const asset = await sdk.assets.get('asset-1');
  const chats = await sdk.telegram.chats.list({ page: 2 });
  const messages = await sdk.telegram.messages.list('chat/one', { q: 'a&b', before: 12, limit: 2 });
  const mentions = await sdk.x.mentions.list({ page: 2 });
  const token = await sdk.token.get();

  assert.deepEqual(requests.map(({ url }) => {
    const parsed = new URL(url, 'http://localhost');
    return [parsed.pathname, Object.fromEntries(parsed.searchParams)];
  }), [
    ['/api/v1/context', {}],
    ['/api/v1/knowledge', { q: 'C++ & tea?', archived: 'false', page: '2', kind: 'note', visibility: 'team' }],
    ['/api/v1/knowledge/docs%3Aalpha%2Fbeta', { offset: '0', limit: '4' }],
    ['/api/v1/assets', { folderId: 'folder-1', page: '2' }],
    ['/api/v1/assets/asset-1', {}],
    ['/api/v1/telegram/chats', { page: '2' }],
    ['/api/v1/telegram/chats/chat%2Fone/messages', { q: 'a&b', before: '12', limit: '2' }],
    ['/api/v1/x/mentions', { page: '2' }],
    ['/api/v1/token', {}],
  ]);
  for (const req of requests) {
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, 'Bearer test-secret');
    assert.equal(req.headers.accept, 'application/json');
  }
  assert.equal(context.data.organization.id, meta.organizationId);
  assert.deepEqual(knowledge.pagination, page);
  assert.equal(item.data.contentRange.nextOffset, 4);
  assert.equal(assets.pagination.folderName, 'Design');
  assert.equal(asset.data.publicUrl, null);
  assert.deepEqual(chats.pagination, page);
  assert.deepEqual(messages.pagination, { limit: 2, hasMore: true, nextBefore: 12, searchLimited: true });
  assert.deepEqual(mentions.pagination, page);
  assert.deepEqual(token.meta, meta);
  assert.equal(token.data.holders.trackedBalanceRaw, '900719925474099312345678901234567890');
  assert.deepEqual(token.http, { status: 200, requestId: 'token-request', etag: '"version-1"', headers: token.http.headers });
  assert.ok(token.http.headers instanceof Headers);
});

test('structured rate limits preserve status, code, request ID, headers and Retry-After without retries', async (t) => {
  let calls = 0;
  const baseUrl = await serve(t, (_req, res) => {
    calls++;
    json(res, { error: { code: 'rate_limited', message: 'Quota exhausted' }, requestId: 'body-id' }, 429, { 'retry-after': '7', 'x-request-id': 'header-id', 'ratelimit-remaining': '0' });
  });
  await assert.rejects(client(baseUrl).context.get(), (error) => {
    assert.ok(error instanceof ClaireAPIError);
    assert.equal(error.status, 429);
    assert.equal(error.code, 'rate_limited');
    assert.equal(error.message, 'Quota exhausted');
    assert.equal(error.requestId, 'header-id');
    assert.equal(error.retryAfterSeconds, 7);
    assert.equal(error.headers.get('ratelimit-remaining'), '0');
    return true;
  });
  assert.equal(calls, 1);
});

test('HTML errors never expose response bodies as error messages', async (t) => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(502, { 'content-type': 'text/html', 'x-request-id': 'gateway-id' });
    res.end('<html>private upstream trace</html>');
  });
  await assert.rejects(client(baseUrl).token.get(), (error) => {
    assert.ok(error instanceof ClaireAPIError);
    assert.equal(error.status, 502);
    assert.equal(error.requestId, 'gateway-id');
    assert.doesNotMatch(error.message, /private|upstream|html/i);
    return true;
  });
});

test('invalid success JSON and missing envelope fields produce response errors', async (t) => {
  let calls = 0;
  const baseUrl = await serve(t, (_req, res) => {
    calls++;
    res.setHeader('x-request-id', `bad-${calls}`);
    if (calls === 1) res.writeHead(200, { 'content-type': 'application/json' }).end('{broken');
    else if (calls === 2) json(res, { data: {}, meta: { organizationId: 'org' } });
    else json(res, { data: null, meta });
  });
  for (let n = 1; n <= 2; n++) {
    await assert.rejects(client(baseUrl).context.get(), (error) => {
      assert.ok(error instanceof ClaireResponseError);
      assert.equal(error.status, 200);
      assert.equal(error.requestId, `bad-${n}`);
      return true;
    });
  }
  assert.equal((await client(baseUrl).context.get()).data, null);
});

test('redirects are rejected without forwarding credentials', async (t) => {
  let followed = false;
  const baseUrl = await serve(t, (req, res) => {
    if (req.url === '/api/v1/context') res.writeHead(302, { location: '/api/v1/landing' }).end();
    else { followed = true; res.writeHead(200).end('leaked'); }
  });
  await assert.rejects(client(baseUrl).context.get());
  assert.equal(followed, false);
});

test('timeouts and caller cancellation interrupt stalled response bodies', async (t) => {
  const baseUrl = await serve(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"data":');
  });
  let timedRequestReceivedHeaders = false;
  await assert.rejects(client(baseUrl, {
    timeoutMs: 1000,
    fetch: async (...args) => {
      const response = await fetch(...args);
      timedRequestReceivedHeaders = true;
      return response;
    },
  }).context.get(), (error) => error.name === 'TimeoutError');
  assert.equal(timedRequestReceivedHeaders, true);

  let receivedHeaders;
  const headersReady = new Promise((resolve) => { receivedHeaders = resolve; });
  const abort = new AbortController();
  const pending = client(baseUrl, {
    timeoutMs: 5000,
    fetch: async (...args) => {
      const response = await fetch(...args);
      receivedHeaders();
      return response;
    },
  }).context.get({ signal: abort.signal });
  await Promise.race([headersReady, pending.then(() => { throw Error('response unexpectedly completed'); }, () => { throw Error('request ended before cancellation'); })]);
  abort.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('invalid credentials, origins, timeouts, IDs and query primitives fail before network access', async (t) => {
  let requests = 0;
  const baseUrl = await serve(t, (_req, res) => { requests++; json(res, envelope({})); });
  for (const apiKey of ['', ' ', 'has space', 'has\nnewline']) {
    assert.throws(() => new Claire({ apiKey, baseUrl }));
  }
  for (const url of ['http://example.com/api/v1', 'https://user:pass@example.com/api/v1', 'https://example.com/api/v1?secret=x', 'https://example.com/api/v1#fragment', 'ftp://example.com/api/v1']) {
    assert.throws(() => new Claire({ apiKey: 'safe', baseUrl: url }));
  }
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => client(baseUrl, { timeoutMs }));
  }
  const sdk = client(baseUrl);
  assert.doesNotMatch(JSON.stringify(sdk), /test-secret/);
  for (const id of ['', '.', '..']) {
    await assert.rejects(sdk.knowledge.get(id), TypeError);
    await assert.rejects(sdk.people.get(id), TypeError);
    await assert.rejects(sdk.assets.get(id), TypeError);
    await assert.rejects(sdk.telegram.messages.list(id), TypeError);
  }
  for (const query of [{ q: null }, { q: {} }, { page: NaN }]) {
    await assert.rejects(async () => sdk.knowledge.list(query));
  }
  await assert.rejects(async () => sdk.knowledge.get('valid', { offset: {} }));
  await assert.rejects(async () => sdk.context.get({ timeoutMs: 0 }));
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(async () => sdk.context.get({ signal: preAborted.signal }), (error) => error.name === 'AbortError');
  assert.equal(requests, 0);
});
