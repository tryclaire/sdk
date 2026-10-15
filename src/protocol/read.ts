import { zeroAddress, type Address, type PublicClient } from "viem";
import { claireDistributorAbi, claireFeeRouterAbi, clairePriceLockAbi, claireProofViewAbi, claireRevenueLockAbi, claireRouterFactoryAbi, claireSplitAbi, claireTokenLockAbi, claireVestingVaultAbi } from "./abis.js";

/** Every reader pins one block so all of its fields describe the same state; omit `blockNumber` for the latest block. */
export type ReadAt = { blockNumber?: bigint | undefined };

export async function pinBlock(client: PublicClient, blockNumber?: bigint) {
  const block = await client.getBlock(blockNumber === undefined ? {} : { blockNumber });
  return { blockNumber: block.number, timestamp: block.timestamp };
}

/** A fee router's immutable configuration plus its quote asset and cumulative revenue. `quote`, `totalRevenue` and `revenueToken` are null before the launch (`revenueToken` also on Stockereum, which has no launch-token revenue). */
export async function readRouter(client: PublicClient, router: Address, at: ReadAt = {}) {
  const { blockNumber } = await pinBlock(client, at.blockNumber);
  const c = { address: router, abi: claireFeeRouterAbi, blockNumber } as const;
  const [launchpad, launchFactory, launchRouter, escrow, registry, creator, payee, projectHolderDistributor, claireHolderDistributor, treasury, feeToken, tokenLock, buybackVault, launchFee, holderBps, launchedToken, curve, stockereumPoolId] = await Promise.all([
    client.readContract({ ...c, functionName: "launchpad" }),
    client.readContract({ ...c, functionName: "launchFactory" }),
    client.readContract({ ...c, functionName: "launchRouter" }),
    client.readContract({ ...c, functionName: "escrow" }),
    client.readContract({ ...c, functionName: "registry" }),
    client.readContract({ ...c, functionName: "creator" }),
    client.readContract({ ...c, functionName: "payee" }),
    client.readContract({ ...c, functionName: "projectHolderDistributor" }),
    client.readContract({ ...c, functionName: "claireHolderDistributor" }),
    client.readContract({ ...c, functionName: "treasury" }),
    client.readContract({ ...c, functionName: "feeToken" }),
    client.readContract({ ...c, functionName: "tokenLock" }),
    client.readContract({ ...c, functionName: "buybackVault" }),
    client.readContract({ ...c, functionName: "launchFee" }),
    client.readContract({ ...c, functionName: "holderBps" }),
    client.readContract({ ...c, functionName: "launchedToken" }),
    client.readContract({ ...c, functionName: "curve" }),
    client.readContract({ ...c, functionName: "stockereumPoolId" }),
  ]);
  const pons = launchpad === 0;
  const quote = launchedToken === zeroAddress ? null : await client.readContract({ ...c, functionName: "quote" });
  const [totalRevenue, revenueToken] = quote === null ? [null, null] : await Promise.all([
    client.readContract({ ...c, functionName: "totalRevenue", args: [quote] }),
    pons ? client.readContract({ ...c, functionName: "totalRevenue", args: [launchedToken] }) : Promise.resolve(null),
  ]);
  return {
    router, blockNumber, launchpad: pons ? "pons" as const : "stockereum" as const, launchFactory, launchRouter, escrow, registry, creator, payee,
    projectHolderDistributor, claireHolderDistributor, treasury, feeToken, tokenLock, buybackVault, launchFee, holderBps, launchedToken, curve, stockereumPoolId, quote, totalRevenue, revenueToken,
  };
}

/** What the router factory records for a token, plus the registered router's facts. `router` is null for tokens Claire did not launch. */
export async function readLaunch(client: PublicClient, input: { token: Address; routerFactory: Address } & ReadAt) {
  const { blockNumber } = await pinBlock(client, input.blockNumber);
  const c = { address: input.routerFactory, abi: claireRouterFactoryAbi, blockNumber } as const;
  const [registered, claireLaunched] = await Promise.all([
    client.readContract({ ...c, functionName: "launchRouterOf", args: [input.token] }),
    client.readContract({ ...c, functionName: "isClaireLaunched", args: [input.token] }),
  ]);
  const router = registered === zeroAddress ? null : registered;
  const isRouter = router === null ? false : await client.readContract({ ...c, functionName: "isRouter", args: [router] });
  return { token: input.token, routerFactory: input.routerFactory, blockNumber, claireLaunched, router, isRouter, routerFacts: router === null ? null : await readRouter(client, router, { blockNumber }) };
}

/** A `ClaireTokenLock` lock with its vested and claimable amounts at the pinned block's timestamp. */
export async function readLock(client: PublicClient, input: { tokenLock: Address; lockId: bigint } & ReadAt) {
  const { blockNumber, timestamp } = await pinBlock(client, input.blockNumber);
  const c = { address: input.tokenLock, abi: claireTokenLockAbi, blockNumber } as const;
  const [lock, vested, claimable] = await Promise.all([
    client.readContract({ ...c, functionName: "getLock", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "vestedAmount", args: [input.lockId, timestamp] }),
    client.readContract({ ...c, functionName: "claimableAmount", args: [input.lockId] }),
  ]);
  return { tokenLock: input.tokenLock, lockId: input.lockId, blockNumber, timestamp, lock, vested, claimable };
}

/** A `ClaireRevenueLock` lock with its tranches, earned revenue and unlocked amounts at the pinned block. */
export async function readRevenueLock(client: PublicClient, input: { revenueLock: Address; lockId: bigint } & ReadAt) {
  const { blockNumber, timestamp } = await pinBlock(client, input.blockNumber);
  const c = { address: input.revenueLock, abi: claireRevenueLockAbi, blockNumber } as const;
  const [lock, tranches, earned, unlocked, claimable] = await Promise.all([
    client.readContract({ ...c, functionName: "getLock", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "getTranches", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "earnedRevenue", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "unlockedAmount", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "claimableAmount", args: [input.lockId] }),
  ]);
  return { revenueLock: input.revenueLock, lockId: input.lockId, blockNumber, timestamp, lock, tranches, earned, unlocked, claimable };
}

/** A distributor round as recorded on-chain (cumulative total, root, snapshot block and evidence hash) plus the asset's live state: latest root, cumulative total, claimed and outstanding. */
export async function readRound(client: PublicClient, input: { distributor: Address; roundId: bigint } & ReadAt) {
  const { blockNumber } = await pinBlock(client, input.blockNumber);
  const c = { address: input.distributor, abi: claireDistributorAbi, blockNumber } as const;
  const [round, roundCount] = await Promise.all([
    client.readContract({ ...c, functionName: "getRound", args: [input.roundId] }),
    client.readContract({ ...c, functionName: "roundCount" }),
  ]);
  const [root, cumulativeTotal, totalClaimed] = await Promise.all([
    client.readContract({ ...c, functionName: "root", args: [round.asset] }),
    client.readContract({ ...c, functionName: "cumulativeTotal", args: [round.asset] }),
    client.readContract({ ...c, functionName: "totalClaimed", args: [round.asset] }),
  ]);
  return { distributor: input.distributor, roundId: input.roundId, blockNumber, roundCount, round, asset: { root, cumulativeTotal, totalClaimed, outstanding: cumulativeTotal - totalClaimed } };
}

/** A `ClairePriceLock` lock with its tranches, the token's `highWater`, window minimum and last sample, and the unlocked amounts at the pinned block. */
export async function readPriceLock(client: PublicClient, input: { priceLock: Address; lockId: bigint } & ReadAt) {
  const { blockNumber, timestamp } = await pinBlock(client, input.blockNumber);
  const c = { address: input.priceLock, abi: clairePriceLockAbi, blockNumber } as const;
  const [lock, tranches, unlocked, claimable] = await Promise.all([
    client.readContract({ ...c, functionName: "getLock", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "getTranches", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "unlockedAmount", args: [input.lockId] }),
    client.readContract({ ...c, functionName: "claimableAmount", args: [input.lockId] }),
  ]);
  const [highWater, window, lastSample] = await Promise.all([
    client.readContract({ ...c, functionName: "highWater", args: [lock.token] }),
    client.readContract({ ...c, functionName: "windowMin", args: [lock.token] }),
    client.readContract({ ...c, functionName: "lastSample", args: [lock.token] }),
  ]);
  return { priceLock: input.priceLock, lockId: input.lockId, blockNumber, timestamp, lock, tranches, unlocked, claimable, highWater, windowMin: window[0], windowFull: window[1], lastSample: { at: lastSample[0], price: lastSample[1] } };
}

/** A `ClaireVestingVault`'s schedule and, per asset (`zeroAddress` is native ETH), what it received, vested and released at the pinned block. */
export async function readVestingVault(client: PublicClient, input: { vault: Address; assets: Address[] } & ReadAt) {
  const { blockNumber, timestamp } = await pinBlock(client, input.blockNumber);
  const c = { address: input.vault, abi: claireVestingVaultAbi, blockNumber } as const;
  const [beneficiary, start, cliff, end, assets] = await Promise.all([
    client.readContract({ ...c, functionName: "beneficiary" }),
    client.readContract({ ...c, functionName: "start" }),
    client.readContract({ ...c, functionName: "cliff" }),
    client.readContract({ ...c, functionName: "end" }),
    Promise.all(input.assets.map(async (asset) => {
      const [totalReceived, released, vested, releasable] = await Promise.all([
        client.readContract({ ...c, functionName: "totalReceived", args: [asset] }),
        client.readContract({ ...c, functionName: "released", args: [asset] }),
        client.readContract({ ...c, functionName: "vested", args: [asset] }),
        client.readContract({ ...c, functionName: "releasable", args: [asset] }),
      ]);
      return { asset, totalReceived, released, vested, releasable };
    })),
  ]);
  return { vault: input.vault, blockNumber, timestamp, beneficiary, start, cliff, end, assets };
}

/** A `ClaireSplit`'s payees and shares and, per asset (`zeroAddress` is native ETH), what it received and paid each payee at the pinned block. */
export async function readSplit(client: PublicClient, input: { split: Address; assets: Address[] } & ReadAt) {
  const { blockNumber } = await pinBlock(client, input.blockNumber);
  const c = { address: input.split, abi: claireSplitAbi, blockNumber } as const;
  const [payees, shares] = await Promise.all([
    client.readContract({ ...c, functionName: "payees" }),
    client.readContract({ ...c, functionName: "shares" }),
  ]);
  const assets = await Promise.all(input.assets.map(async (asset) => {
    const [totalReceived, totalPaid, paid, releasable] = await Promise.all([
      client.readContract({ ...c, functionName: "totalReceived", args: [asset] }),
      client.readContract({ ...c, functionName: "totalPaid", args: [asset] }),
      Promise.all(payees.map((_, i) => client.readContract({ ...c, functionName: "paid", args: [asset, BigInt(i)] }))),
      Promise.all(payees.map((_, i) => client.readContract({ ...c, functionName: "releasable", args: [asset, BigInt(i)] }))),
    ]);
    return { asset, totalReceived, totalPaid, paid, releasable };
  }));
  return { split: input.split, blockNumber, payees, shares, assets };
}

/** `ClaireProofView.proof(token)`: Claire launch facts, router revenue per quote and launch token, locked amounts in the three lock contracts and the pons permanently locked supply, in one call. */
export async function readProof(client: PublicClient, input: { proofView: Address; token: Address } & ReadAt) {
  const { blockNumber } = await pinBlock(client, input.blockNumber);
  const proof = await client.readContract({ address: input.proofView, abi: claireProofViewAbi, functionName: "proof", args: [input.token], blockNumber });
  return { ...proof, proofView: input.proofView, token: input.token, blockNumber, launchpad: proof.claireLaunched ? (proof.launchpad === 0 ? "pons" as const : "stockereum" as const) : null };
}
