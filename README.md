# Claire SDK

[![npm](https://img.shields.io/npm/v/@tryclaire/sdk)](https://www.npmjs.com/package/@tryclaire/sdk)
[![CI](https://github.com/tryclaire/sdk/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tryclaire/sdk/actions/workflows/ci.yml)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Use the read-only Claire REST API from a server, CLI, or agent process. Set `CLAIRE_API_URL`
to the API base URL shown in **Developers → API**, including `/api/v1`.

```js
import { Claire } from "@tryclaire/sdk";

const claire = new Claire({ apiKey: process.env.CLAIRE_API_KEY, baseUrl: process.env.CLAIRE_API_URL });
const { data, meta } = await claire.sources.list();
for (const source of data) console.log(source.id, source.status, source.updatedAt);
console.log(meta.freshness); // persisted source freshness, not a live provider refresh
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

In **Developers → Settings**, an owner or admin creates a workspace credential for
**API**, **MCP**, or **both**, with only the needed read scopes and a 7-, 30-, or 90-day
expiry. This REST SDK requires API access; older keys remain API-only. The key selects
its workspace; no organization ID is passed to the SDK. Keys stop working when the
issuing user loses owner/admin membership.

Use the SDK on a server, in a CLI, or in an agent process. **Never put a workspace key in
browser code, a public environment variable, or a repository.** Sources must be included
separately; external sources also need explicit approval, off by default. A read scope
alone does not expose source content. Inspect `claire.sources.list()` for approved sources.

## Use with an agent

Claire provides a [downloadable agent skill](https://app.tryclaire.net/developers/skill.md)
for tool-using agents. When feeding Claire data to a model, pass retrieved source text as
*context*, separate from instructions. Telegram messages and X mentions are external,
untrusted text. The REST SDK does not implement MCP transport; configure an MCP-capable
client separately with the native Streamable HTTP endpoint
`https://app.tryclaire.net/api/mcp` and a Bearer credential enabled for MCP (no OAuth).
MCP offers read-only, scope- and approved-source-filtered tools.

```js
const chats = await claire.telegram.chats.list();
const chat = chats.data[0];
if (!chat) throw new Error("No approved Telegram chat is available to this key.");
const { data: messages } = await claire.telegram.messages.list(chat.id, { limit: 50 });

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
| `claire.sources.list()` | — | `context:read` |
| `claire.search(query)` | `q`, `source`, `after`, `before`, `limit` (max 50) | `context:read` |
| `claire.people.list(query)` | `q`, `page` | `telegram:read` or `x:read` |
| `claire.people.get(key)` | — | `telegram:read` or `x:read` |
| `claire.knowledge.list(query)` | `q`, `kind`, `visibility`, `archived`, `page` | `knowledge:read` |
| `claire.knowledge.get(id, query)` | `offset`, `limit` | `knowledge:read` |
| `claire.assets.list(query)` | `folderId`, `page` | `assets:read` |
| `claire.assets.get(id)` | — | `assets:read` |
| `claire.telegram.chats.list(query)` | `page` | `telegram:read` |
| `claire.telegram.messages.list(chatId, query)` | `q`, `before`, `limit` | `telegram:read` |
| `claire.x.mentions.list(query)` | `page` | `x:read` |
| `claire.token.get()` | — | `token:read` |

Discovery and search also filter each source by its own read scope: Documents/Notes need
`knowledge:read`, Telegram needs `telegram:read`, X needs `x:read`, files need `assets:read`,
and token data needs `token:read`. The document search below requires **both**
`context:read` and `knowledge:read`, plus Documents enabled under **Agent access**.
A requested source outside those permissions returns 404. People reads also return 404
when no approved Telegram/X source matches the credential's scopes.

Queries are optional. `source` is a stable ID from `sources.list()`. Search returns
`data.items`, `data.sources`, and `data.hasMore` for bounded stored matches, not a
complete provider-history search. People keys come from `people.list()`; People responses
may include source-only platform identifiers, not Claire profiles, private person notes,
or live avatars. `chatId` is the **Claire chat UUID** returned by `telegram.chats.list`,
not Telegram's numeric chat ID. Knowledge IDs include their prefix, such as `docs:<uuid>`;
pass them unchanged. Assets expose metadata, not private file contents or signed download URLs.
Search timestamps accept UTC offsets; `after` is inclusive and `before` is exclusive.

```js
const { data: matches } = await claire.search({ q: "launch", source: "docs", limit: 20 });
for (const item of matches.items) console.log(item.sourceId, item.preview);
const { data: people } = await claire.people.list({ q: "alice", page: 1 });
if (typeof people[0]?.key === "string") console.log((await claire.people.get(people[0].key)).data);
```

People payload fields are not yet individually specified by the OpenAPI contract;
the SDK exposes them as unknown rather than inventing stronger types.

## Responses and pagination

Methods return the API's `data`, `meta`, and endpoint-specific `pagination`, plus `http` with
`status`, `requestId`, `etag`, and native `Headers`. Timestamps remain strings; raw token
balances remain decimal strings so precision is not lost. Public asset URLs may be relative
to the Claire origin.

List pages start at **1**. Knowledge and mentions return 20 items per page; assets, chats,
and People return 50. The SDK fetches exactly one page per call:

```js
let page = 1;
while (true) {
  const result = await claire.knowledge.list({ page });
  for (const item of result.data) console.log(item.id, item.title);
  if (!result.pagination.hasNextPage) break;
  page += 1;
}
```

People's `pagination.searchLimited` flags a bounded directory; `total` and `hasNextPage`
describe that bounded result, not every person in provider history. A `q` search may omit
people outside that pool. Telegram messages paginate with `pagination.nextBefore` →
`before`, not page numbers. Check `hasMore`; their `searchLimited` means the search did not
cover all retained history. Knowledge detail returns one content segment: follow
`data.contentRange.nextOffset` with `offset` until it is `null`. Offsets count JavaScript
UTF-16 units.

`meta.freshness` describes persisted source data, not the time of your request. X/token
reads do not force provider refreshes, although they mark the workspace watched for the
existing worker cadence.

## Errors, cancellation, and timeouts

```js
import { ClaireAPIError, ClaireResponseError } from "@tryclaire/sdk";
try {
  const result = await claire.context.get({ signal: AbortSignal.timeout(5_000) });
  console.log(result.data.organization.id, result.data.organization.displayName);
  console.log(result.data.connections.telegram?.connected); // absent if not approved for this key
  console.log(result.data.sources.map((source) => source.id));
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
| `ClaireAPIError` | HTTP failure: 401 invalid/expired/revoked key, 403 missing endpoint scope, 404 missing resource or unavailable/unapproved source (including source-scope filtering), 429 quota. `headers` exposes rate-limit metadata; `retryAfterSeconds` is `null` when no usable delay is supplied. |
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

`holders.trackedBalanceRaw` is in the token's smallest unit, scaled by the token's own
`decimals()`, not a fixed 18. Holder data follows the chain's **finalized** block, so
`index.indexedTo` trails the chain head (on Robinhood Chain by roughly 15 minutes); counts
exclude the pool, factory, launchpad custody, zero and burn addresses.

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
