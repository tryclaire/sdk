# Changelog

## 0.5.0

- Added `token.locks.list()`, `token.feeRouters.list()` and `token.rounds.list()` for the new `GET /token/locks`, `/token/fee-routers` and `/token/rounds` reads (`token:read`). Lock rows cover both time locks and revenue locks (`kind: "time" | "revenue"`) with their public proof IDs, and each round carries the URL of its canonical manifest. The bundled OpenAPI snapshot and generated types are updated.
- Added `@tryclaire/sdk/protocol`: typed contract ABIs, readers (`readLaunch`, `readRouter`, `readLock`, `readRevenueLock`, `readRound`), verifiers (`verifyLaunch`, `verifyRouterSplit`, `verifyLock`, `verifyRevenueLock`, `verifyRound`) and hashing helpers (`roundLeafHash`, `merkleRoot`, `merkleProof`, `manifestEvidence`) that check Claire launches, locks and distribution rounds against a chain you provide.
- `viem` is an optional peer dependency used only by the `protocol` subpath. The root API client is unchanged and dependency-free.
