# Claire SDK

[![npm](https://img.shields.io/npm/v/@tryclaire/sdk)](https://www.npmjs.com/package/@tryclaire/sdk)
[![CI](https://github.com/tryclaire/sdk/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tryclaire/sdk/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Give your scripts and agents read access to a [Claire](https://tryclaire.net) project workspace:
Telegram history, X mentions, Knowledge, assets, and token data, with explicit freshness on
every response.

```js
import { Claire } from "@tryclaire/sdk";

const claire = new Claire({ apiKey: process.env.CLAIRE_API_KEY });
const { data, meta } = await claire.knowledge.list({ q: "launch plan" });

for (const item of data) console.log(item.title, "—", item.preview);
console.log(meta.freshness); // when this data was last collected, not when you asked
```

- **Read-only by design.** No send, publish, or write methods exist. A leaked key can read, never act.
- **Honest freshness.** Every response carries `meta.freshness`; stale and unavailable data is labeled, never guessed.
- **Typed from the API contract.** Types are generated from the committed [`openapi.json`](openapi.json).
- **Nothing hidden.** No retries, no cache, no background requests. One call, one HTTP request.
- **Zero runtime dependencies.** Node.js 22+, ESM, native `fetch`.

[API reference](https://app.tryclaire.net/developers) ·
[Agent skill](https://app.tryclaire.net/developers/skill.md) ·
[Docs](https://docs.tryclaire.net/reference/developer-api) ·
[npm](https://www.npmjs.com/package/@tryclaire/sdk) ·
[Releases](https://github.com/tryclaire/sdk/releases)

## Install

```sh
npm install @tryclaire/sdk
```

Also works with `pnpm add`, `yarn add`, and `bun add`. Built JavaScript and TypeScript
declarations are included.

## Get a key

In **Organization → Developers**, an owner or admin creates an expiring key with only the
read scopes your integration needs. The key selects its workspace; no organization ID is
passed to the SDK. Keys stop working when the issuing user loses owner/admin membership.

Use the SDK on a server, in a CLI, or in an agent process. **Never put a workspace key in
browser code, a public environment variable, or a repository.**

## Use with an agent

Claire ships a [downloadable agent skill](https://app.tryclaire.net/developers/skill.md)
describing the API to tool-using agents. When feeding Claire data to a model, pass source
content as *context*, separate from your instructions. Telegram messages and X mentions are
external, untrusted text.

```js
const chats = await claire.telegram.chats.list();
const { data: messages } = await claire.telegram.messages.list(chats.data[0].id, { limit: 50 });

const context = messages
  .filter((m) => m.text)
  .map((m) => `[${m.sentAt}] ${m.sender.name}: ${m.text}`)
  .join("\n");
// Hand `context` to your model as data; keep your prompt separate.
```

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

## Responses and pagination

Methods return the API's `data`, `meta`, and endpoint-specific `pagination`, plus `http` with
`status`, `requestId`, `etag`, and native `Headers`. Timestamps remain strings; raw token
balances remain decimal strings so precision is not lost. Public asset URLs may be relative
to the Claire origin.

List pages start at **1**. Knowledge and mentions return 20 items per page; assets and chats
return 50. The SDK fetches exactly one page per call:

```js
let page = 1;
while (true) {
  const result = await claire.knowledge.list({ page });
  for (const item of result.data) console.log(item.id, item.title);
  if (!result.pagination.hasNextPage) break;
  page += 1;
}
```

Telegram messages paginate with `pagination.nextBefore` → `before`, not page numbers. Check
`hasMore`; `searchLimited` means the search did not cover all retained history. Knowledge
detail returns one content segment: follow `data.contentRange.nextOffset` with `offset`
until it is `null`. Offsets count JavaScript UTF-16 units.

`meta.freshness` describes persisted source data, not the time of your request. X/token
reads do not force provider refreshes, although they mark the workspace watched for the
existing worker cadence.

## Errors, cancellation, and timeouts

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

| Error | When |
| --- | --- |
| `ClaireAPIError` | HTTP failure: 401 invalid/expired/revoked key, 403 missing scope, 429 quota. `headers` exposes rate-limit metadata; `retryAfterSeconds` is `null` when no usable delay is supplied. |
| `ClaireResponseError` | Successful status but malformed JSON/envelope. Types come from OpenAPI; the SDK does not deep-validate at runtime. |
| native fetch errors | Network failure, abort, timeout. Passed through unchanged. |

Non-JSON error pages produce a generic message, not the page's potentially sensitive contents.

The default timeout is 30 seconds, including response-body reading. Set `timeoutMs` on the
client or per call. Request options are always the last argument:

```js
const controller = new AbortController();
await claire.knowledge.list({ page: 1 }, { timeoutMs: 5_000 });
await claire.knowledge.get("docs:<uuid>", { offset: 0 }, { signal: controller.signal });
```

Handle 429 according to `retryAfterSeconds`; do not loop on invalid keys or missing scopes.
ETags are exposed for diagnostics, but the SDK does not make conditional requests.

## Token identity

Token responses carry typed chain and protocol identity. Network availability depends on
the API deployment.

```js
const { data, meta } = await claire.token.get();
if (data.token) {
  const { chainId, address, protocol, pool, poolId, pairedToken } = data.token;
}
```

Identify a token by **chainId and address together**, not address alone. Ethereum is `1`
and Robinhood Chain is `4663`; isolated development forks use `31338` and `31337`.
`protocol` is `"pons"` or `"stockereum"`. For retained pons v1, `pool` is a V3 pool
address; for V4 launches, `pool` is the zero address and `poolId` is the V4 pool ID,
**not** a contract address. `poolId` and `pairedToken` can be `null`; `data.token` is
`null` when no token is linked. These are persisted observations, not live quotes; inspect
`meta.freshness` first.

## Configuration

```js
const claire = new Claire({
  apiKey: process.env.CLAIRE_API_KEY,
  baseUrl: "https://app.tryclaire.net/api/v1", // default
  timeoutMs: 30_000,                            // default
  fetch: globalThis.fetch,                      // default
});
```

The base URL includes `/api/v1`. HTTPS is required except for loopback HTTP during local
development. URL credentials, query strings, and fragments are rejected. Redirects are
rejected rather than forwarding the key. Only configure an origin you trust with that key.
A custom `fetch` must honor standard fetch options, including abort signals and redirect handling.

## Contributing

```sh
npm ci --ignore-scripts
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contract updates and the release process.

## License

[MIT](LICENSE). Copyright © 2026 Claire contributors.
