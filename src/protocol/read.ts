import { zeroAddress, type Address, type PublicClient } from "viem";
import { claireDistributorAbi, claireFeeRouterAbi, claireRevenueLockAbi, claireRouterFactoryAbi, claireTokenLockAbi } from "./abis.js";

/** Every reader pins one block so all of its fields describe the same state; omit `blockNumber` for the latest block. */
export type ReadAt = { blockNumber?: bigint | undefined };

export async function pinBlock(client: PublicClient, blockNumber?: bigint) {
  const block = await client.getBlock(blockNumber === undefined ? {} : { blockNumber });
  return { blockNumber: block.number, timestamp: block.timestamp };
}

/** A fee router's immutable configuration plus its quote asset and cumulative revenue. `quote` and `totalRevenue` are null before the launch. */
export async function readRouter(client: PublicClient, router: Address, at: ReadAt = {}) {
  const { blockNumber } = await pinBlock(client, at.blockNumber);
  const c = { address: router, abi: claireFeeRouterAbi, blockNumber } as const;
  const [launchpad, launchFactory, launchRouter, escrow, registry, creator, projectHolderDistributor, claireHolderDistributor, treasury, feeToken, tokenLock, launchFee, holderBps, launchedToken, curve] = await Promise.all([
    client.readContract({ ...c, functionName: "launchpad" }),
    client.readContract({ ...c, functionName: "launchFactory" }),
    client.readContract({ ...c, functionName: "launchRouter" }),
    client.readContract({ ...c, functionName: "escrow" }),
    client.readContract({ ...c, functionName: "registry" }),
    client.readContract({ ...c, functionName: "creator" }),
    client.readContract({ ...c, functionName: "projectHolderDistributor" }),
    client.readContract({ ...c, functionName: "claireHolderDistributor" }),
    client.readContract({ ...c, functionName: "treasury" }),
    client.readContract({ ...c, functionName: "feeToken" }),
    client.readContract({ ...c, functionName: "tokenLock" }),
    client.readContract({ ...c, functionName: "launchFee" }),
    client.readContract({ ...c, functionName: "holderBps" }),
    client.readContract({ ...c, functionName: "launchedToken" }),
    client.readContract({ ...c, functionName: "curve" }),
  ]);
  const quote = launchedToken === zeroAddress ? null : await client.readContract({ ...c, functionName: "quote" });
  const totalRevenue = quote === null ? null : await client.readContract({ ...c, functionName: "totalRevenue", args: [quote] });
  return {
    router, blockNumber, launchpad: launchpad === 0 ? "pons" as const : "stockereum" as const, launchFactory, launchRouter, escrow, registry, creator,
    projectHolderDistributor, claireHolderDistributor, treasury, feeToken, tokenLock, launchFee, holderBps, launchedToken, curve, quote, totalRevenue,
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

/** A distributor round as recorded on-chain (root, total, snapshot block and evidence hash). */
export async function readRound(client: PublicClient, input: { distributor: Address; roundId: bigint } & ReadAt) {
  const { blockNumber } = await pinBlock(client, input.blockNumber);
  const c = { address: input.distributor, abi: claireDistributorAbi, blockNumber } as const;
  const [round, roundCount] = await Promise.all([
    client.readContract({ ...c, functionName: "getRound", args: [input.roundId] }),
    client.readContract({ ...c, functionName: "roundCount" }),
  ]);
  return { distributor: input.distributor, roundId: input.roundId, blockNumber, roundCount, round };
}
