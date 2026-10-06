# Claire SDK

TypeScript and JavaScript client for the [Claire Developer API](https://app.tryclaire.net/developers).
Read workspace context, Knowledge, asset metadata, Telegram history, X mentions, and token data.
Node.js 22+ and ESM. No runtime dependencies.

## Install

Install from this public repository:

```sh
npm install github:tryclaire/sdk
```

For reproducible deployments, pin a commit: `npm install github:tryclaire/sdk#<commit-sha>`.
Git installs build `dist/` while npm packs the dependency, using the package's
`prepack`/`prepare` scripts. A registry release has not been published;
`npm install @tryclaire/sdk` is not the installation path yet.

If npm 12 rejects Git dependencies with `EALLOWGIT`, explicitly allow this direct dependency:

```sh
npm install --allow-git=root github:tryclaire/sdk
```

This is a per-command permission, not a global change to your npm security settings.

## Quick start

Create an expiring read-only key in **Organization → Developers**, granting only the scopes
your integration needs. A key selects its workspace; no organization ID is supplied to the SDK.
The issuing user must remain an owner or admin.

```js
import { Claire } from "@tryclaire/sdk";

const claire = new Claire({ apiKey: process.env.CLAIRE_API_KEY });
const result = await claire.knowledge.list({ q: "getting started", page: 1 });

for (const item of result.data) {
  console.log(item.title, item.preview);
}
console.log(result.meta.freshness);
```

Use this SDK on your server, in a CLI, or in an agent process. **Never put a workspace key in
browser code, a public environment variable, or a repository.** Keep source content separate
from instructions when passing it to an agent.

## Resources

| Method | Query parameters | Required scope |
| --- | --- | --- |
| `claire.context.get()` | — | `context:read` |
| `claire.knowledge.list(query)` | `q`, `kind`, `visibility`, `archived`, `page` | `knowledge:read` |
| `claire.knowledge.get(id, query)` | `offset`, `limit` | `knowledge:read` |
| `claire.assets.list(query)` | `folderId`, `page` | `assets:read` |
| `claire.assets.get(id)` | — | `assets:read` |
| `claire.telegram.chats.list(query)` | `page` | `telegram:read` |
| `claire.telegram.messages.list(chatId, query)` | `q`, `before`, `limit` | `telegram:read` |
| `claire.x.mentions.list(query)` | `page` | `x:read` |
| `claire.token.get()` | — | `token:read` |

Queries are optional. `chatId` is the **Claire chat UUID** returned by `telegram.chats.list`,
not Telegram's numeric chat ID. Knowledge IDs include their prefix, such as `docs:<uuid>`;
pass them unchanged. Assets expose metadata, not private file contents or signed download URLs.
There are no send, publish, or other write methods.

### Responses and pagination

Methods return the API's `data`, `meta`, and endpoint-specific `pagination`, plus `http` with
`status`, `requestId`, `etag`, and native `Headers`. Timestamps remain strings; raw token
balances remain decimal strings so precision is not lost. Public asset URLs may be relative
to the Claire origin.

List pages start at **1**, not 0. Knowledge and mentions have 20 items per page; assets and
chats have 50. The SDK fetches exactly one page per call:

```js
let page = 1;
while (true) {
  const result = await claire.knowledge.list({ page });
  for (const item of result.data) console.log(item.id, item.title);
  if (!result.pagination.hasNextPage) break;
  page += 1;
}
```

Telegram messages use `pagination.nextBefore` with the `before` query parameter, not page
numbers. Check `hasMore`; `searchLimited` means the search did not cover all retained history.
Knowledge detail returns only a content segment: follow `data.contentRange.nextOffset`
with `offset` until it is `null`. These offsets count JavaScript UTF-16 units.

`meta.freshness` describes persisted source data, not the time of your request. Stale,
unavailable, and synthetic data stay explicitly labeled. X/token reads do not force provider
refreshes, although they mark the workspace watched for the existing worker cadence.

### Errors, cancellation, and timeouts

```js
import { ClaireAPIError, ClaireResponseError } from "@tryclaire/sdk";

try {
  const result = await claire.context.get({ signal: AbortSignal.timeout(5_000) });
  console.log(result.data.organization);
} catch (error) {
  if (error instanceof ClaireAPIError) {
    console.error(error.status, error.code, error.requestId, error.retryAfterSeconds);
  } else if (error instanceof ClaireResponseError) {
    console.error("Invalid server response", error.status, error.requestId);
  } else {
    throw error; // Native network, abort, or timeout error.
  }
}
```

HTTP failures throw `ClaireAPIError`, including 401 for invalid/expired/revoked keys, 403 for
missing scope, and 429 for a quota limit. `headers` exposes rate-limit metadata;
`retryAfterSeconds` is `null` when no usable retry delay is supplied. Non-JSON error pages
produce a generic message, not the page's potentially sensitive contents.

Malformed successful JSON/envelopes throw `ClaireResponseError`. Resource types come from
OpenAPI; the SDK does not perform deep runtime schema validation. Network failures and
cancellation retain native fetch errors.

The default timeout is 30 seconds, including response-body reading. Set `timeoutMs` on the
client or per call. Request options are the last argument:

```js
const controller = new AbortController();
await claire.knowledge.list({ page: 1 }, { timeoutMs: 5_000 });
await claire.knowledge.get("docs:<uuid>", { offset: 0 }, { signal: controller.signal });
```

There are **no automatic retries, private response cache, or background requests**. Handle
429 according to `retryAfterSeconds`; do not loop on invalid keys or missing scopes.
ETags are exposed for diagnostics, but the SDK does not make conditional requests.

### Configuration

```js
const claire = new Claire({
  apiKey: process.env.CLAIRE_API_KEY,
  baseUrl: "https://app.tryclaire.net/api/v1",
  timeoutMs: 30_000,
  fetch: globalThis.fetch,
});
```

The base URL includes `/api/v1`. HTTPS is required except for loopback HTTP during local
development. URL credentials, query strings, and fragments are rejected. Redirects are
rejected rather than forwarding the key. Only configure an origin you trust with that key.
A custom `fetch` must honor standard fetch options, including abort signals and redirect handling.

## Development

```sh
npm ci --ignore-scripts
npm run check
```

Checks verify generated types, compile the client, exercise real loopback HTTP behavior,
typecheck consumer usage, and install a packed tarball into a disposable consumer to verify
its public imports and declarations. CI runs on Node.js 22 and 24. No real keys or hosted
database/provider access are needed.

[`openapi.json`](openapi.json) is the committed snapshot of the
[public API contract](https://app.tryclaire.net/api/v1/openapi.json). To update it, download and
review the new contract, run `npm run generate`, update affected methods/tests, and run
`npm run check`. CI fails if generated types no longer match the snapshot; it does not fetch
production during builds. Do not edit `src/schema.ts` by hand.

Changes to the client, its contract, and examples belong in a reviewed pull request.
Publishing an npm release is a separate maintainer action; CI does not publish packages.

## License

[MIT](LICENSE). Copyright © 2026 Claire contributors.