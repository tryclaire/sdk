# Changelog

## 0.6.0

`@tryclaire/sdk/protocol` now targets Claire v3. Breaking: the distributor ABI, leaf encoding and round manifest changed, and the router and token lock ABIs gained fields.

- API client: added `token.proof.get()` for `GET /token/proof` (the facts of the public Claire Proof card, read from the chain; `data` is null when no token is linked). Lock rows now cover `kind: "time" | "revenue" | "price"` with `cancelNotice` and price-target fields, fee routers carry `payee`, `payeeKind`, `payeeTerms`, `buyback` and per-asset totals including launch-token revenue, and rounds are cumulative (`cumulativeTotal`, `previousEvidence`, manifest version 2). The bundled OpenAPI snapshot and generated types are updated.
- ABIs for all 11 contracts (adds `ClaireVestingVault`, `ClaireSplit`, `ClaireVaultFactory`, `ClairePriceLock`, `ClaireProofView` and `ClaireDistributorFactory`).
- `verifyRouterSplit` counts launch-token (buyback) revenue next to quote revenue and fails revenue charged in any other asset. `readRouter` adds `payee`, `buybackVault`, `stockereumPoolId` and `revenueToken`. `verifyLaunch` checks the payee, buyback vault and Stockereum pool id against the factory and its events, and with `vaultFactory` classifies the payee (`facts.payeeKind`).
- New verifiers `verifyPriceLock`, `verifyVestingVault` and `verifySplit`, and readers `readPriceLock`, `readVestingVault`, `readSplit` and `readProof` (`ClaireProofView`).
- `verifyLock` checks the notice-period cancel state (`facts.cancelState`, `cancelNotice`, `cancelAt`) against the `CancelRequested` and `Canceled` events.
- `verifyRound` verifies cumulative distributor roots and the version 2 manifest (`previousEvidence` chaining, per-account cumulative continuity, `cumulativeTotal`, claims within the latest root) and takes an optional `previousManifest`. `roundLeafHash` is now `roundLeafHash(chainId, distributor, asset, { account, cumulative })`, `RoundLeaf` is `{ account, cumulative }`, and `parseRoundManifest` accepts version 2 only.
- `ClaireDeployment` carries every address of the v3 deploy manifest (`routerFactory`, `tokenLock`, `revenueLock`, `priceLock`, `distributorFactory`, `vaultFactory`, `proofView`, `claireHolderDistributor`, `referralDistributor`, `treasury`, `feeToken`); the `deployments` map stays empty until deployment.

## 0.5.0

- Added `token.locks.list()`, `token.feeRouters.list()` and `token.rounds.list()` for the new `GET /token/locks`, `/token/fee-routers` and `/token/rounds` reads (`token:read`). Lock rows cover both time locks and revenue locks (`kind: "time" | "revenue"`) with their public proof IDs, and each round carries the URL of its canonical manifest. The bundled OpenAPI snapshot and generated types are updated.
- Added `@tryclaire/sdk/protocol`: typed contract ABIs, readers (`readLaunch`, `readRouter`, `readLock`, `readRevenueLock`, `readRound`), verifiers (`verifyLaunch`, `verifyRouterSplit`, `verifyLock`, `verifyRevenueLock`, `verifyRound`) and hashing helpers (`roundLeafHash`, `merkleRoot`, `merkleProof`, `manifestEvidence`) that check Claire launches, locks and distribution rounds against a chain you provide.
- `viem` is an optional peer dependency used only by the `protocol` subpath. The root API client is unchanged and dependency-free.
