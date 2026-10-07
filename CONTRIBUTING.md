# Contributing

## Development

```sh
npm ci --ignore-scripts
npm run check
```

Checks verify generated types, compile the client, exercise real loopback HTTP behavior,
typecheck consumer usage, and install a packed tarball into a disposable consumer to verify
its public imports and declarations. CI runs on Node.js 22 and 24. No real keys or hosted
database/provider access are needed.

### Installing unreleased versions

`npm install github:tryclaire/sdk#<commit-sha>`. Git installs build the package during
packing. With npm 12, use `--allow-git=root` if your policy blocks direct Git dependencies.

## Updating the API contract

[`openapi.json`](openapi.json) is the committed snapshot of the
[public API contract](https://app.tryclaire.net/api/v1/openapi.json). To update it, download and
review the new contract, run `npm run generate`, update affected methods/tests, and run
`npm run check`. CI fails if generated types no longer match the snapshot; it does not fetch
production during builds. Do not edit `src/schema.ts` by hand.

Before a release, compare the parsed snapshot with the schema served by the **verified
target deployment**. Use a running current-main local API while preparing locally, then
repeat against the hosted API after rollout:

```sh
API_SCHEMA_URL="https://app.tryclaire.net/api/v1/openapi.json" node --input-type=module <<'JS'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const response = await fetch(process.env.API_SCHEMA_URL);
assert.ok(response.ok, `Schema request failed: ${response.status}`);
assert.deepStrictEqual(JSON.parse(await readFile("openapi.json", "utf8")), await response.json());
console.log("SDK snapshot matches the selected API deployment.");
JS
```

The prepared snapshot can precede the hosted rollout. A mismatch must be reviewed before
publishing, not bypassed by changing the URL to an older deployment. This is a release
handoff check; ordinary CI remains independent of production.

Changes to the client, its contract, and examples belong in a reviewed pull request.

## Releases

The npm package trusts GitHub organization `tryclaire`, repository `sdk`, workflow
`publish.yml` for token-free publishing.

Update `version` in `package.json` and `package-lock.json`, merge the change to `main`, and
wait for SDK CI to pass. In GitHub Actions, run **Publish SDK** on `main` with that exact
version. Leave **dry_run** enabled first to verify the package; run again with it disabled
to publish. Existing npm versions cannot be overwritten.

The release workflow reruns verification and uses npm trusted publishing with GitHub OIDC
and provenance. It needs no stored npm token. Ordinary pushes and pull requests do not publish.
