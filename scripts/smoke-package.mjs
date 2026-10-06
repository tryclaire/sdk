import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const consumer = await mkdtemp(join(tmpdir(), "claire-sdk-consumer-"));
try {
  const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", consumer], { cwd: root, encoding: "utf8" }));
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund", join(consumer, Object.values(packed)[0].filename)], { cwd: consumer, stdio: "pipe" });
  await writeFile(join(consumer, "consumer.ts"), `
import { Claire, ClaireAPIError, type TokenSummary } from '@tryclaire/sdk';
const client = new Claire({ apiKey: 'local-smoke-key' });
const response = await client.token.get();
const token: TokenSummary = response.data;
const raw: string | undefined = token.holders?.trackedBalanceRaw;
// @ts-expect-error Raw balances are strings, not floating-point numbers.
const lossy: number = token.holders?.trackedBalanceRaw;
void [raw, lossy, ClaireAPIError];
`);
  execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.ts"], { cwd: consumer, stdio: "inherit" });
  await writeFile(join(consumer, "consumer.mjs"), `
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Claire, ClaireAPIError } from '@tryclaire/sdk';
const server = createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer local-smoke-key') {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'unauthorized', message: 'Invalid key' }, requestId: 'local-auth' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({
    data: { connected: false, token: null, index: null, holders: null, latestFees: null, latestTradeAt: null,
      sources: { transfers: { updatedAt: null, status: 'unavailable' }, fees: { updatedAt: null, status: 'unavailable' } } },
    meta: { organizationId: '00000000-0000-4000-8000-000000000001', freshness: { source: 'database', updatedAt: null, status: 'unavailable' } }
  }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  const result = await new Claire({ apiKey: 'local-smoke-key', baseUrl }).token.get();
  assert.equal(result.data.connected, false);
  assert.equal(result.data.holders, null);
  assert.equal(result.meta.freshness.status, 'unavailable');
  await assert.rejects(new Claire({ apiKey: 'invalid-local-key', baseUrl }).token.get(), (error) =>
    error instanceof ClaireAPIError && error.status === 401 && error.code === 'unauthorized');
  console.log('Installed package: typed imports, successful read, and authentication error verified.');
} finally {
  server.closeAllConnections();
  server.close();
}
`);
  execFileSync(process.execPath, ["consumer.mjs"], { cwd: consumer, stdio: "inherit" });
} finally {
  await rm(consumer, { recursive: true, force: true });
}
