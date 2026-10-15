import { BaseError, isAddress, parseAbi, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { claireDistributorAbi, claireFeeRouterAbi, claireRevenueLockAbi, claireRouterFactoryAbi, claireTokenLockAbi } from "./abis.js";
import { manifestEvidence, merkleRoot, roundLeafHash, type RoundLeaf } from "./hash.js";
import { pinBlock, readLaunch, readLock, readRevenueLock, readRound, type ReadAt } from "./read.js";

export type Check = { id: string; ok: boolean; detail: string };
/** `ok` is true only when every check passed. `facts` holds what was read and recomputed, so callers can show it. */
export type Verification<Facts> = { ok: boolean; checks: Check[]; facts: Facts };

/** Event scans run from `fromBlock` (default 0) to `toBlock` (default: the pinned block) in `chunk`-sized requests. */
export type ScanOptions = { fromBlock?: bigint; toBlock?: bigint; chunk?: bigint };

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const BPS = BigInt(10_000);
const ZERO = BigInt(0);

function collector() {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, detail: string) => { checks.push({ id, ok, detail }); return ok; };
  /** Runs a read; a throw becomes a failed check instead of an exception, so a fake or wrong contract is reported, not crashed on. */
  const attempt = async <T>(id: string, read: () => Promise<T>): Promise<T | undefined> => {
    try { return await read(); } catch (error) { add(id, false, error instanceof BaseError ? error.shortMessage : String(error)); return undefined; }
  };
  const finish = <Facts>(facts: Facts): Verification<Facts> => ({ ok: checks.every((check) => check.ok), checks, facts });
  return { add, attempt, finish };
}

async function scan<T>(from: bigint, to: bigint, chunk: bigint, get: (from: bigint, to: bigint) => Promise<T[]>) {
  const out: T[] = [];
  for (let start = from; start <= to; start += chunk) out.push(...await get(start, start + chunk - BigInt(1) < to ? start + chunk - BigInt(1) : to));
  return out;
}

/** Resolves the pinned block and the scan range once for a verifier. */
async function range(client: PublicClient, input: ReadAt & ScanOptions) {
  const { blockNumber, timestamp } = await pinBlock(client, input.toBlock ?? input.blockNumber);
  return { blockNumber, timestamp, from: input.fromBlock ?? ZERO, chunk: input.chunk ?? BigInt(10_000) };
}

// ------------------------------------------------------------------ launch

/** The token is registered by the router factory, its router is a factory router launched for it, and the router's immutables match the factory. */
export async function verifyLaunch(client: PublicClient, input: { token: Address; routerFactory: Address; tokenLock?: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const launch = await attempt("registry", () => readLaunch(client, { token: input.token, routerFactory: input.routerFactory, blockNumber }));
  const facts = { token: input.token, routerFactory: input.routerFactory, blockNumber, router: launch?.router ?? null, launch: launch?.routerFacts ?? null, launchBlock: null as bigint | null };
  if (!launch) return finish(facts);
  const router = launch.routerFacts;
  if (!add("registered", launch.claireLaunched && launch.router !== null, launch.router ? `Factory records router ${launch.router}` : "The factory has no launch router for this token") || !router) return finish(facts);
  add("router-listed", launch.isRouter, "The router was created by the factory");
  add("router-token", same(router.launchedToken, input.token) && same(router.registry, input.routerFactory), `Router launched ${router.launchedToken} and reports registry ${router.registry}`);
  const c = { address: input.routerFactory, abi: claireRouterFactoryAbi, blockNumber } as const;
  const pons = router.launchpad === "pons";
  const expected = await attempt("factory-config", () => Promise.all([
    client.readContract({ ...c, functionName: "treasury" }),
    client.readContract({ ...c, functionName: "claireHolderDistributor" }),
    client.readContract({ ...c, functionName: "feeToken" }),
    client.readContract({ ...c, functionName: "launchFee" }),
    client.readContract({ ...c, functionName: pons ? "ponsFactory" : "stockereumFactory" }),
    client.readContract({ ...c, functionName: pons ? "ponsEscrow" : "stockereumEscrow" }),
    pons ? client.readContract({ ...c, functionName: "ponsLaunchRouter" }) : Promise.resolve(router.launchRouter),
  ]));
  if (expected) {
    const actual = [router.treasury, router.claireHolderDistributor, router.feeToken, router.launchFee, router.launchFactory, router.escrow, router.launchRouter];
    add("factory-config", expected.every((value, i) => String(value).toLowerCase() === String(actual[i]).toLowerCase()), "Router treasury, holder distributor, fee token, launch fee and launchpad addresses equal the factory's");
  }
  if (input.tokenLock) add("token-lock", same(router.tokenLock, input.tokenLock), `Router's opening-buy lock is ${router.tokenLock}`);
  const max = await attempt("holder-routing", () => client.readContract({ address: launch.router!, abi: claireFeeRouterAbi, functionName: "MAX_HOLDER_BPS", blockNumber }));
  if (max !== undefined) add("holder-routing", router.holderBps <= max && (router.holderBps === 0) === same(router.projectHolderDistributor, zeroAddress), `holderBps ${router.holderBps}, project distributor ${router.projectHolderDistributor}`);
  const launched = await attempt("launch-event", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: launch.router!, abi: claireFeeRouterAbi, eventName: "Launched", args: { token: input.token }, fromBlock, toBlock, strict: true })));
  if (launched) {
    facts.launchBlock = launched[0]?.blockNumber ?? null;
    add("launch-event", launched.length === 1 && same(launched[0]!.args.quote, router.quote ?? zeroAddress), launched.length === 1 ? `Launched at block ${launched[0]!.blockNumber} with quote ${launched[0]!.args.quote}` : `Expected one Launched event, found ${launched.length}`);
  }
  return finish(facts);
}

// ------------------------------------------------------------------ router split

/** Recomputes the split of every `Distributed` event in the range and ties the revenue they charged to `totalRevenue`. */
export async function verifyRouterSplit(client: PublicClient, input: { router: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const c = { address: input.router, abi: claireFeeRouterAbi, blockNumber } as const;
  const config = await attempt("router", async () => {
    const [holderBps, bps, claireBps, launched] = await Promise.all([
      client.readContract({ ...c, functionName: "holderBps" }), client.readContract({ ...c, functionName: "BPS" }),
      client.readContract({ ...c, functionName: "CLAIRE_SHARE_BPS" }), client.readContract({ ...c, functionName: "launchedToken" }),
    ]);
    return { holderBps: BigInt(holderBps), bps: BigInt(bps), claireBps: BigInt(claireBps), quote: same(launched, zeroAddress) ? null : await client.readContract({ ...c, functionName: "quote" }) };
  });
  const events = config && await attempt("events", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ ...c, eventName: "Distributed", fromBlock, toBlock, strict: true })));
  const facts = { router: input.router, blockNumber, distributions: 0, revenue: new Map<Address, bigint>(), totalRevenue: new Map<Address, bigint>() };
  if (!config || !events) return finish(facts);
  facts.distributions = events.length;
  const problems: string[] = [];
  for (const { args: e, blockNumber: at } of events) {
    const claire = e.revenue * config.claireBps / config.bps;
    const holders = e.revenue * config.holderBps / config.bps;
    const want = [e.received - claire - holders, holders, claire / BigInt(2), claire - claire / BigInt(2)];
    const onChain = await client.readContract({ ...c, functionName: "split", args: [e.revenue] });
    const got = [e.creatorAmount, e.projectHolderAmount, e.claireHolderAmount, e.treasuryAmount];
    if (e.revenue > e.received || want.some((value, i) => value !== got[i]) || onChain[1] !== holders || onChain[2] !== claire / BigInt(2) || onChain[3] !== claire - claire / BigInt(2) || onChain[0] + (e.received - e.revenue) !== e.creatorAmount) problems.push(`block ${at}`);
    facts.revenue.set(e.asset, (facts.revenue.get(e.asset) ?? ZERO) + e.revenue);
  }
  add("split", !problems.length, problems.length ? `${problems.length} distribution(s) differ from the router's split: ${problems.join(", ")}` : `${events.length} distribution(s) match the router's split`);
  if (config.quote) facts.revenue.set(config.quote, facts.revenue.get(config.quote) ?? ZERO);
  // A scan from the start must account for all revenue; a partial scan can only be a lower bound.
  const complete = from === ZERO;
  const mismatched: string[] = [];
  for (const [asset, sum] of facts.revenue) {
    const total = await client.readContract({ ...c, functionName: "totalRevenue", args: [asset] });
    facts.totalRevenue.set(asset, total);
    if (complete ? sum !== total : sum > total) mismatched.push(`${asset}: events ${sum}, totalRevenue ${total}`);
  }
  add("total-revenue", !mismatched.length, mismatched.length ? mismatched.join("; ") : `Distributed revenue ${complete ? "equals" : "is within"} totalRevenue for ${facts.revenue.size} asset(s)`);
  return finish(facts);
}

// ------------------------------------------------------------------ locks

/** Recomputes the vesting schedule and ties the lock to its creation event; flags opening-buy locks funded by the token's Claire router. */
export async function verifyLock(client: PublicClient, input: { tokenLock: Address; lockId: bigint; routerFactory?: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const read = await attempt("lock", () => readLock(client, { tokenLock: input.tokenLock, lockId: input.lockId, blockNumber }));
  const facts = { ...input, blockNumber, openingBuy: false, read: read ?? null };
  if (!read) return finish(facts);
  const { lock, timestamp, vested, claimable } = read;
  add("schedule", lock.start < lock.end && lock.start <= lock.cliff && lock.cliff <= lock.end, `start ${lock.start}, cliff ${lock.cliff}, end ${lock.end}`);
  const t = timestamp;
  const expected = lock.canceled || t >= BigInt(lock.end) ? lock.amount
    : t < BigInt(lock.cliff) || t < BigInt(lock.start) ? ZERO
      : BigInt(lock.amount) * (t - BigInt(lock.start)) / BigInt(lock.end - lock.start);
  add("vesting", vested === expected && claimable === vested - lock.claimed && lock.claimed <= vested, `Vested ${vested} of ${lock.amount} at ${t}; recomputed ${expected}`);
  const created = await attempt("creation-event", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: input.tokenLock, abi: claireTokenLockAbi, eventName: "LockCreated", args: { lockId: input.lockId }, fromBlock, toBlock, strict: true })));
  if (created) {
    const e = created[0]?.args;
    add("creation-event", created.length === 1 && !!e && same(e.token, lock.token) && same(e.beneficiary, lock.beneficiary) && same(e.funder, lock.funder) && e.start === lock.start && e.cliff === lock.cliff && e.end === lock.end
      && e.cancelable === lock.cancelable && e.transferable === lock.transferable && (lock.canceled ? e.amount >= lock.amount : e.amount === lock.amount),
    created.length === 1 ? "LockCreated matches the stored lock" : `Expected one LockCreated event, found ${created.length}`);
  }
  const held = await attempt("custody", () => Promise.all([
    client.readContract({ address: lock.token, abi: erc20Abi, functionName: "balanceOf", args: [input.tokenLock], blockNumber }),
    client.readContract({ address: input.tokenLock, abi: claireTokenLockAbi, functionName: "locked", args: [lock.token], blockNumber }),
  ]));
  if (held) add("custody", held[0] >= held[1], `Lock contract holds ${held[0]} of ${lock.token}; ${held[1]} is owed to locks`);
  if (input.routerFactory) {
    const router = await attempt("opening-buy", () => client.readContract({ address: input.routerFactory!, abi: claireRouterFactoryAbi, functionName: "launchRouterOf", args: [lock.token], blockNumber }));
    if (router !== undefined) {
      facts.openingBuy = !same(router, zeroAddress) && same(router, lock.funder);
      if (!facts.openingBuy) add("opening-buy", true, `Funded by ${lock.funder}, not the token's Claire router`);
      else {
        const events = await attempt("opening-buy", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
          address: router, abi: claireFeeRouterAbi, eventName: "OpeningBuyLocked", args: { token: lock.token, lockId: input.lockId }, fromBlock, toBlock, strict: true })));
        if (events) add("opening-buy", events.length === 1 && !lock.cancelable && !!created?.[0] && events[0]!.args.amount === created[0].args.amount, events.length === 1 ? "Router's OpeningBuyLocked matches this lock" : `Expected one OpeningBuyLocked event, found ${events.length}`);
      }
    }
  }
  return finish(facts);
}

/** Recomputes tranches, baseline and unlocked amount from the router's own `totalRevenue` and ties the lock to its creation event. */
export async function verifyRevenueLock(client: PublicClient, input: { revenueLock: Address; lockId: bigint } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const read = await attempt("lock", () => readRevenueLock(client, { revenueLock: input.revenueLock, lockId: input.lockId, blockNumber }));
  const facts = { ...input, blockNumber, totalRevenue: null as bigint | null, read: read ?? null };
  if (!read) return finish(facts);
  const { lock, tranches, timestamp } = read;
  const bpsSum = tranches.reduce((sum, tranche) => sum + tranche.bps, 0);
  add("tranches", tranches.length >= 1 && tranches.length <= 10 && bpsSum === 10_000 && tranches.every((tranche, i) => tranche.bps > 0 && (i === 0 || tranche.revenue > tranches[i - 1]!.revenue)), `${tranches.length} tranche(s) summing to ${bpsSum} bps`);
  const registry = await attempt("router", () => client.readContract({ address: input.revenueLock, abi: claireRevenueLockAbi, functionName: "registry", blockNumber }));
  const rc = { address: lock.router, abi: claireFeeRouterAbi, blockNumber } as const;
  const router = registry && await attempt("router", () => Promise.all([
    client.readContract({ address: registry, abi: claireRouterFactoryAbi, functionName: "launchRouterOf", args: [lock.token], blockNumber }),
    client.readContract({ address: registry, abi: claireRouterFactoryAbi, functionName: "isRouter", args: [lock.router], blockNumber }),
    client.readContract({ ...rc, functionName: "quote" }),
    client.readContract({ ...rc, functionName: "launchedToken" }),
    client.readContract({ ...rc, functionName: "totalRevenue", args: [lock.asset] }),
  ]));
  if (router) {
    add("router", same(router[0], lock.router) && router[1] && same(router[2], lock.asset) && same(router[3], lock.token), `Registry ${registry} records ${router[0]} as the token's router; quote ${router[2]}`);
    facts.totalRevenue = router[4];
    const earned = router[4] - lock.baseline;
    const bps = tranches.reduce((sum, tranche) => earned >= tranche.revenue ? sum + BigInt(tranche.bps) : sum, ZERO);
    const unlocked = timestamp >= BigInt(lock.deadline) ? lock.amount : BigInt(lock.amount) * bps / BPS;
    add("unlocked", router[4] >= lock.baseline && read.earned === earned && read.unlocked === unlocked && read.claimable === unlocked - lock.claimed && lock.claimed <= unlocked,
      `Router revenue ${router[4]} - baseline ${lock.baseline} = ${earned}; unlocked ${unlocked} of ${lock.amount}`);
  }
  const created = await attempt("creation-event", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: input.revenueLock, abi: claireRevenueLockAbi, eventName: "RevenueLockCreated", args: { lockId: input.lockId }, fromBlock, toBlock, strict: true })));
  if (created) {
    const e = created[0]?.args;
    add("creation-event", created.length === 1 && !!e && same(e.token, lock.token) && same(e.beneficiary, lock.beneficiary) && same(e.funder, lock.funder) && same(e.router, lock.router) && same(e.asset, lock.asset)
      && e.amount === lock.amount && e.baseline === lock.baseline && e.deadline === lock.deadline && e.tranches.length === tranches.length
      && e.tranches.every((tranche, i) => tranche.revenue === tranches[i]!.revenue && tranche.bps === tranches[i]!.bps),
    created.length === 1 ? "RevenueLockCreated matches the stored lock, baseline and tranches" : `Expected one RevenueLockCreated event, found ${created.length}`);
  }
  const held = await attempt("custody", () => Promise.all([
    client.readContract({ address: lock.token, abi: erc20Abi, functionName: "balanceOf", args: [input.revenueLock], blockNumber }),
    client.readContract({ address: input.revenueLock, abi: claireRevenueLockAbi, functionName: "locked", args: [lock.token], blockNumber }),
  ]));
  if (held) add("custody", held[0] >= held[1], `Lock contract holds ${held[0]} of ${lock.token}; ${held[1]} is owed to locks`);
  return finish(facts);
}

// ------------------------------------------------------------------ rounds

export type RoundLevel = "manifest" | "balances" | "complete";
type Hole = string | null;
export type RoundManifest = {
  kind: "claire-round"; version: 1; purpose: "project-holders" | "claire-holders" | "airdrop" | "referrals"; chainId: number; distributor: Address; asset: Address; total: string;
  snapshot: { chainId: number; block: string; token: Address | null };
  rule: { type: "pro-rata"; distributable: string; eligibleBalance: string; excluded: Address[]; minBalance: Hole } | { type: "referral-rewards"; rewards: [Address, string, string[]][] };
  leaves: (RoundLeaf & { balance: Hole })[];
};

const uint = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
const addr = (value: unknown): value is Address => typeof value === "string" && isAddress(value, { strict: false }) && value === value.toLowerCase();

/** Throws with the first structural problem; the shape is the canonical round manifest, version 1. */
export function parseRoundManifest(text: string): RoundManifest {
  const m = JSON.parse(text) as Record<string, any>;
  const bad = (what: string): never => { throw new Error(`Invalid manifest: ${what}`); };
  if (m.kind !== "claire-round" || m.version !== 1) bad("kind or version");
  if (!["project-holders", "claire-holders", "airdrop", "referrals"].includes(m.purpose)) bad("purpose");
  if (!Number.isInteger(m.chainId) || !addr(m.distributor) || !addr(m.asset) || !uint(m.total)) bad("chainId, distributor, asset or total");
  if (!Number.isInteger(m.snapshot?.chainId) || !uint(m.snapshot?.block) || !(m.snapshot?.token === null || addr(m.snapshot?.token))) bad("snapshot");
  if (m.rule?.type === "pro-rata") {
    if (!Array.isArray(m.rule.excluded) || !m.rule.excluded.every(addr) || !(m.rule.minBalance === null || uint(m.rule.minBalance)) || !uint(m.rule.distributable) || !uint(m.rule.eligibleBalance) || BigInt(m.rule.eligibleBalance) === ZERO || m.snapshot.token === null) bad("pro-rata rule");
  } else if (m.rule?.type === "referral-rewards") {
    if (!Array.isArray(m.rule.rewards) || !m.rule.rewards.every((r: unknown) => Array.isArray(r) && addr(r[0]) && uint(r[1]) && Array.isArray(r[2]))) bad("referral rewards");
  } else bad("rule type");
  if (!Array.isArray(m.leaves) || !m.leaves.length) bad("leaves");
  m.leaves.forEach((leaf: Record<string, unknown>, i: number) => {
    if (leaf.index !== i || !addr(leaf.account) || !uint(leaf.amount) || BigInt(leaf.amount) === ZERO || BigInt(leaf.amount) >= BigInt(2) ** BigInt(128) || !(leaf.balance === null || uint(leaf.balance))) bad(`leaf ${i}`);
  });
  return m as RoundManifest;
}


export type VerifyRoundInput = {
  distributor: Address; roundId: bigint; level?: RoundLevel;
  /** The manifest exactly as served. Without it, `manifestBaseUrl` is asked for `/rounds/<chainId>/<distributor>/<evidence>.json`. */
  manifest?: string; manifestBaseUrl?: string;
  /** Client for the snapshot's chain when it differs from the distributor's chain (balances and complete levels). */
  snapshotClient?: PublicClient;
} & ReadAt & ScanOptions;

/**
 * `manifest`: the manifest hashes to the on-chain evidence, its leaves rebuild the on-chain root and total, and its asset, distributor and chain match.
 * `balances`: adds each leaf balance at the snapshot block, and that every amount is floor(rule.distributable * balance / rule.eligibleBalance) with eligibleBalance covering the listed balances.
 * `complete`: adds a Transfer-log scan up to the snapshot block: after the manifest's exclusions and minimum balance, the eligible balances must sum to rule.eligibleBalance and the leaves are exactly the holders whose share is not zero.
 */
export async function verifyRound(client: PublicClient, input: VerifyRoundInput) {
  const { add, attempt, finish } = collector();
  const level = input.level ?? "manifest";
  const facts = { distributor: input.distributor, roundId: input.roundId, level, evidence: null as Hex | null, manifest: null as RoundManifest | null, distributable: null as bigint | null, eligible: null as number | null };
  const onChain = await attempt("round", () => readRound(client, { distributor: input.distributor, roundId: input.roundId, ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }) }));
  if (!onChain) return finish(facts);
  const { round } = onChain;
  const chainId = await client.getChainId();
  facts.evidence = round.evidence;
  let text = input.manifest;
  if (text === undefined && input.manifestBaseUrl) {
    const url = `${input.manifestBaseUrl.replace(/\/$/, "")}/rounds/${chainId}/${input.distributor.toLowerCase()}/${round.evidence}.json`;
    text = await attempt("manifest-source", async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return response.text();
    });
  } else if (text === undefined) add("manifest-source", false, "Pass the manifest or a manifestBaseUrl");
  if (text === undefined) return finish(facts);
  add("evidence", manifestEvidence(text) === round.evidence, `keccak256(manifest) ${manifestEvidence(text)}; on-chain evidence ${round.evidence}`);
  let manifest: RoundManifest;
  try { manifest = parseRoundManifest(text); } catch (error) { add("manifest-shape", false, String(error)); return finish(facts); }
  facts.manifest = manifest;
  add("manifest-shape", true, `${manifest.leaves.length} leaves, purpose ${manifest.purpose}`);
  add("round-binding", manifest.chainId === chainId && same(manifest.distributor, input.distributor) && same(manifest.asset, round.asset) && manifest.total === String(round.total) && manifest.snapshot.block === String(round.snapshotBlock),
    `Manifest chain ${manifest.chainId}, distributor ${manifest.distributor}, asset ${manifest.asset}, total ${manifest.total}, snapshot block ${manifest.snapshot.block}`);
  const sum = manifest.leaves.reduce((total, leaf) => total + BigInt(leaf.amount), ZERO);
  add("total", sum === BigInt(round.total) && sum === BigInt(manifest.total), `Leaves sum to ${sum}; on-chain total ${round.total}`);
  add("unique-accounts", new Set(manifest.leaves.map((leaf) => leaf.account)).size === manifest.leaves.length, "Every account appears once");
  const hashes = manifest.leaves.map((leaf) => roundLeafHash(chainId, input.distributor, input.roundId, leaf));
  add("root", merkleRoot(hashes) === round.root, `Rebuilt root ${merkleRoot(hashes)}; on-chain root ${round.root}`);
  const leaf0 = manifest.leaves[0]!;
  const encoded = await attempt("leaf-encoding", () => client.readContract({ address: input.distributor, abi: claireDistributorAbi, functionName: "leaf", args: [input.roundId, BigInt(0), leaf0.account, BigInt(leaf0.amount)] }));
  if (encoded) add("leaf-encoding", encoded === hashes[0], "The distributor's own leaf() agrees with the SDK's leaf hash");

  const { rule } = manifest;
  if (rule.type === "referral-rewards") {
    const owed = new Map<string, bigint>();
    for (const [account, amount] of rule.rewards) owed.set(account, (owed.get(account) ?? ZERO) + BigInt(amount));
    add("rewards", owed.size === manifest.leaves.length && manifest.leaves.every((leaf) => owed.get(leaf.account) === BigInt(leaf.amount)), "Each leaf equals the sum of that account's listed rewards");
    return finish(facts);
  }
  if (level === "manifest") return finish(facts);

  const token = manifest.snapshot.token!;
  const snapshotClient = manifest.snapshot.chainId === chainId ? client : input.snapshotClient;
  if (!snapshotClient || await snapshotClient.getChainId() !== manifest.snapshot.chainId) {
    add("snapshot-chain", false, `A client for chain ${manifest.snapshot.chainId} is required (snapshotClient)`);
    return finish(facts);
  }
  const block = BigInt(manifest.snapshot.block);
  const balances: bigint[] = [];
  for (let i = 0; i < manifest.leaves.length; i += 25) {
    const batch = await attempt("balances", () => Promise.all(manifest.leaves.slice(i, i + 25).map((leaf) => snapshotClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [leaf.account], blockNumber: block }))));
    if (!batch) return finish(facts);
    balances.push(...batch);
  }
  const shares = manifest.leaves.map((leaf, i) => ({ amount: BigInt(leaf.amount), balance: balances[i]! }));
  const min = rule.minBalance === null ? ZERO : BigInt(rule.minBalance);
  add("balances", manifest.leaves.every((leaf, i) => leaf.balance === String(balances[i])) && shares.every((share) => share.balance > ZERO && share.balance >= min), `Leaf balances equal balanceOf at block ${block} on chain ${manifest.snapshot.chainId}`);
  const excluded = new Set(rule.excluded);
  add("exclusions", manifest.leaves.every((leaf) => !excluded.has(leaf.account)), `${excluded.size} excluded address(es) are absent from the leaves`);
  const D = BigInt(rule.distributable), H = BigInt(rule.eligibleBalance);
  facts.distributable = D;
  if (level === "balances") {
    add("pro-rata", H >= shares.reduce((sum, share) => sum + share.balance, ZERO) && shares.every((share) => share.amount === D * share.balance / H), `Every leaf is floor(${D} * balance / ${H}), and ${H} covers the listed balances`);
    return finish(facts);
  }

  const transfers = await attempt("transfers", () => scan(input.fromBlock ?? ZERO, block, input.chunk ?? BigInt(10_000), (fromBlock, toBlock) => snapshotClient.getContractEvents({ address: token, abi: erc20Abi, eventName: "Transfer", fromBlock, toBlock, strict: true })));
  if (!transfers) return finish(facts);
  const held = new Map<Address, bigint>();
  for (const { args } of transfers) {
    const from = args.from.toLowerCase() as Address, to = args.to.toLowerCase() as Address;
    if (from !== zeroAddress) held.set(from, (held.get(from) ?? ZERO) - args.value);
    if (to !== zeroAddress) held.set(to, (held.get(to) ?? ZERO) + args.value);
  }
  const supply = await attempt("scan-supply", () => snapshotClient.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply", blockNumber: block }));
  if (supply !== undefined) add("scan-supply", [...held.values()].reduce((total, value) => total + value, ZERO) === supply, `Scanned ${transfers.length} transfer(s); balances sum to the token's total supply ${supply}`);
  const eligible = [...held].filter(([account, balance]) => balance > ZERO && balance >= min && !excluded.has(account));
  facts.eligible = eligible.length;
  const scanned = eligible.reduce((total, [, balance]) => total + balance, ZERO);
  const listed = new Set(manifest.leaves.map((leaf) => leaf.account));
  // Holders whose share rounds to zero have no leaf, so membership is checked against the recomputed shares, not by equality.
  const missing = eligible.filter(([account, balance]) => !listed.has(account) && D * balance / H !== ZERO);
  const wrong = manifest.leaves.filter((leaf) => { const b = held.get(leaf.account); return b === undefined || BigInt(leaf.balance ?? -1) !== b || BigInt(leaf.amount) !== D * b / H; });
  add("complete", scanned === H && !missing.length && !wrong.length, scanned !== H
    ? `Scanned eligible balance ${scanned} differs from the manifest's ${H}`
    : missing.length || wrong.length
      ? `${missing.length} eligible holder(s) missing and ${wrong.length} leaf(s) inconsistent with the scanned balances`
      : `${eligible.length} eligible holder(s) hold ${H}; every leaf is floor(${D} * balance / ${H})`);
  return finish(facts);
}
