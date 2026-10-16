import { BaseError, encodeAbiParameters, isAddress, keccak256, parseAbi, zeroAddress, zeroHash, type Address, type Hex, type PublicClient } from "viem";
import { claireDistributorAbi, claireFeeRouterAbi, clairePriceLockAbi, claireRevenueLockAbi, claireRouterDeployerAbi, claireRouterFactoryAbi, claireSplitAbi, claireTokenLockAbi, claireVaultFactoryAbi, claireVestingVaultAbi } from "./abis.js";
import { deployments } from "./deployments.js";
import { manifestEvidence, merkleRoot, roundLeafHash, type RoundLeaf } from "./hash.js";
import { pinBlock, readLaunch, readLock, readPriceLock, readRevenueLock, readRound, readSplit, readVestingVault, type ReadAt } from "./read.js";

export type Check = { id: string; ok: boolean; detail: string };
/** `ok` is true only when every check passed. `facts` holds what was read and recomputed, so callers can show it. */
export type Verification<Facts> = { ok: boolean; checks: Check[]; facts: Facts };

/** Event scans run from `fromBlock` to `toBlock` (default: the pinned block) in `chunk`-sized requests. `fromBlock` defaults to the `block` of the chain's entry in `deployments`, else 0: pass the deployment block for a deployment that is not listed. */
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
  return { blockNumber, timestamp, from: input.fromBlock ?? await defaultFrom(client), chunk: input.chunk ?? BigInt(10_000) };
}

/** The listed deployment's block for this chain (a failed chain id read falls back to 0, the always-correct start). */
async function defaultFrom(client: PublicClient) {
  const chainId = client.chain?.id ?? await client.getChainId().catch(() => undefined);
  return (chainId === undefined ? undefined : deployments[chainId]?.block) ?? ZERO;
}

const blockTimes = new WeakMap<PublicClient, Map<bigint, bigint>>();
/** Timestamp of a block, cached per client (block timestamps never change once mined). */
async function blockTime(client: PublicClient, blockNumber: bigint) {
  const cache = blockTimes.get(client) ?? blockTimes.set(client, new Map()).get(client)!;
  const known = cache.get(blockNumber);
  if (known !== undefined) return known;
  const { timestamp } = await client.getBlock({ blockNumber });
  cache.set(blockNumber, timestamp);
  return timestamp;
}

// ------------------------------------------------------------------ launch

/**
 * The token is registered by the router factory, its router is a factory router that either launched it or adopted it, and the router's fixed configuration matches the factory
 * and the factory's `RouterDeployed` event (creator, launchpad, holder routing). The router's address is the one the factory's router deployer predicts for its initial configuration (`routerDeployer`, default: the factory's own).
 * The payee and holder share may differ from the deploy event only through the router's own events: the history of `HolderShareRaised`, `PayeeChangeProposed`, `PayeeChangeCanceled` and `PayeeChanged`
 * is replayed from the deploy event's values (raises only go up, a payee change follows a proposal made 7 days earlier) and must end at the router's current values and pending proposal; `facts.initial`, `facts.holderShareRaises` and `facts.payeeChanges` report it.
 * `facts.path` is `'launched'` (one `Launched` event) or `'migrated'` (an existing pons token: one `Adopted` event
 * and the router's `MigrationFeePaid` payment); either way the router registered the token (`ClaireLaunchRegistered`). On Stockereum the router's pool id is the one the launchpad reported.
 * With `vaultFactory`, `facts.payeeKind` tells whether the current payee is the creator, a genuine `ClaireVestingVault`, a genuine `ClaireSplit` or another address.
 */
export async function verifyLaunch(client: PublicClient, input: { token: Address; routerFactory: Address; routerDeployer?: Address; tokenLock?: Address; vaultFactory?: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const launch = await attempt("registry", () => readLaunch(client, { token: input.token, routerFactory: input.routerFactory, blockNumber }));
  const facts = { token: input.token, routerFactory: input.routerFactory, blockNumber, router: launch?.router ?? null, launch: launch?.routerFacts ?? null, path: null as "launched" | "migrated" | null, launchBlock: null as bigint | null, payeeKind: null as "creator" | "vault" | "split" | "other" | null,
    initial: null as { payee: Address; holderBps: number } | null, holderShareRaises: [] as { blockNumber: bigint; oldBps: number; newBps: number }[], payeeChanges: [] as { blockNumber: bigint; oldPayee: Address; newPayee: Address }[] };
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
    client.readContract({ ...c, functionName: "migrationFee" }),
    client.readContract({ ...c, functionName: pons ? "ponsFactory" : "stockereumFactory" }),
    client.readContract({ ...c, functionName: pons ? "ponsEscrow" : "stockereumEscrow" }),
    pons ? client.readContract({ ...c, functionName: "ponsLaunchRouter" }) : Promise.resolve(router.launchRouter),
    pons ? client.readContract({ ...c, functionName: "ponsBuybackVault" }) : Promise.resolve(zeroAddress),
  ]));
  if (expected) {
    const actual = [router.treasury, router.claireHolderDistributor, router.feeToken, router.launchFee, router.migrationFee, router.launchFactory, router.escrow, router.launchRouter, router.buybackVault];
    add("factory-config", expected.every((value, i) => String(value).toLowerCase() === String(actual[i]).toLowerCase()), "Router treasury, holder distributor, fee token, launch and migration fees, launchpad addresses and buyback vault equal the factory's");
  }
  if (input.tokenLock) add("token-lock", same(router.tokenLock, input.tokenLock), `Router's opening-buy lock is ${router.tokenLock}`);
  const [max, delay] = await attempt("holder-routing", () => Promise.all([
    client.readContract({ address: launch.router!, abi: claireFeeRouterAbi, functionName: "MAX_HOLDER_BPS", blockNumber }),
    client.readContract({ address: launch.router!, abi: claireFeeRouterAbi, functionName: "PAYEE_DELAY", blockNumber }),
  ])) ?? [];
  if (max !== undefined) add("holder-routing", router.holderBps <= max && !same(router.projectHolderDistributor, zeroAddress), `holderBps ${router.holderBps}, project distributor ${router.projectHolderDistributor}`);
  const deployed = await attempt("router-deployed", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: input.routerFactory, abi: claireRouterFactoryAbi, eventName: "RouterDeployed", args: { router: launch.router! }, fromBlock, toBlock, strict: true })));
  const e = deployed?.[0]?.args;
  if (deployed) {
    add("router-deployed", deployed.length === 1 && !!e && same(e.creator, router.creator) && same(e.projectHolderDistributor, router.projectHolderDistributor) && e.launchpad === (pons ? 0 : 1),
      deployed.length === 1 ? `Factory deployed the router for creator ${router.creator}` : `Expected one RouterDeployed event, found ${deployed.length}`);
  }
  if (e && deployed!.length === 1) {
    facts.initial = { payee: e.payee, holderBps: e.holderBps };
    const deployer = await attempt("router-address", () => client.readContract({ ...c, functionName: "routers" }));
    const publisher = deployer && await attempt("router-address", () => client.readContract({ address: router.projectHolderDistributor, abi: claireDistributorAbi, functionName: "publisher", blockNumber }));
    if (deployer && publisher) {
      // The factory's CREATE2 key: its deployment parameters, with the publisher of the project holder distributor.
      const key = keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint16" }, { type: "bytes32" }], [pons ? 0 : 1, router.creator, e.payee, publisher, e.holderBps, e.salt]));
      const predicted = await attempt("router-address", () => client.readContract({ address: deployer, abi: claireRouterDeployerAbi, functionName: "predict", blockNumber, args: [
        key, { launchpad: pons ? 0 : 1, launchFactory: router.launchFactory, launchRouter: router.launchRouter, escrow: router.escrow, registry: router.registry, creator: router.creator, payee: e.payee,
          projectHolderDistributor: router.projectHolderDistributor, claireHolderDistributor: router.claireHolderDistributor, treasury: router.treasury, feeToken: router.feeToken, tokenLock: router.tokenLock,
          buybackVault: router.buybackVault, launchFee: router.launchFee, migrationFee: router.migrationFee, holderBps: e.holderBps }] }));
      if (predicted) add("router-address", (!input.routerDeployer || same(input.routerDeployer, deployer)) && same(predicted, launch.router!), `The factory's router deployer ${deployer} predicts ${predicted} for the initial configuration`);
    }
    const history = await attempt("split-history", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
      address: launch.router!, abi: claireFeeRouterAbi, fromBlock, toBlock, strict: true })));
    if (history && delay !== undefined) {
      let holderBps = e.holderBps, payee = e.payee, pending: { next: Address; at: bigint } | null = null;
      const problems: string[] = [];
      for (const ev of history) {
        if (ev.eventName === "HolderShareRaised") {
          const { oldBps, newBps } = ev.args;
          if (oldBps !== holderBps || newBps <= oldBps || (max !== undefined && newBps > max)) problems.push(`holder share ${oldBps} to ${newBps} at block ${ev.blockNumber}`);
          facts.holderShareRaises.push({ blockNumber: ev.blockNumber, oldBps, newBps });
          holderBps = newBps;
        } else if (ev.eventName === "PayeeChangeProposed") {
          if (ev.args.effectiveAt !== await blockTime(client, ev.blockNumber) + delay) problems.push(`proposal timing at block ${ev.blockNumber}`);
          pending = { next: ev.args.next, at: ev.args.effectiveAt };
        } else if (ev.eventName === "PayeeChangeCanceled") {
          if (!pending || !same(pending.next, ev.args.next)) problems.push(`cancel without that proposal at block ${ev.blockNumber}`);
          pending = null;
        } else if (ev.eventName === "PayeeChanged") {
          const { oldPayee, newPayee } = ev.args;
          if (!pending || !same(pending.next, newPayee) || !same(oldPayee, payee) || await blockTime(client, ev.blockNumber) < pending.at) problems.push(`payee change to ${newPayee} at block ${ev.blockNumber}`);
          facts.payeeChanges.push({ blockNumber: ev.blockNumber, oldPayee, newPayee });
          payee = newPayee;
          pending = null;
        }
      }
      if (holderBps !== router.holderBps) problems.push(`holderBps ${router.holderBps} is not the last raised share ${holderBps}`);
      if (!same(payee, router.payee)) problems.push(`payee ${router.payee} is not the last applied payee ${payee}`);
      if (!same(pending?.next ?? zeroAddress, router.pendingPayee) || (pending?.at ?? ZERO) !== router.payeeChangeAt) problems.push(`pending payee ${router.pendingPayee} does not match the last proposal`);
      add("split-history", !problems.length, problems.length ? `The router's holder share and payee differ from what its events allow: ${problems.join("; ")}` : `Holder share ${e.holderBps} to ${router.holderBps} and payee ${e.payee} to ${router.payee} follow the router's ${facts.holderShareRaises.length} raise(s) and ${facts.payeeChanges.length} payee change(s)`);
    }
  }
  const events = <E extends "Launched" | "Adopted" | "MigrationFeePaid">(eventName: E, args?: { token: Address }) => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: launch.router!, abi: claireFeeRouterAbi, eventName, ...(args ? { args } : {}), fromBlock, toBlock, strict: true } as never));
  const [launched, adopted] = await Promise.all([
    attempt("launch-event", () => events("Launched", { token: input.token })) as Promise<{ blockNumber: bigint; args: { quote: Address } }[] | undefined>,
    attempt("launch-event", () => events("Adopted", { token: input.token })) as Promise<{ blockNumber: bigint; args: { quote: Address } }[] | undefined>,
  ]);
  if (launched && adopted) {
    // A token enters Claire one way: launched by its router (`Launched`) or an existing pons token adopted by it (`Adopted`), never both.
    const path = launched.length === 1 && !adopted.length ? "launched" as const : adopted.length === 1 && !launched.length && pons ? "migrated" as const : null;
    const entry = (path === "migrated" ? adopted : launched)[0];
    facts.path = path;
    facts.launchBlock = path ? entry!.blockNumber : null;
    add("launch-event", !!path && same(entry!.args.quote, router.quote ?? zeroAddress),
      path ? `${path === "launched" ? "Launched" : "Adopted"} at block ${entry!.blockNumber} with quote ${entry!.args.quote}` : `Expected one Launched or one Adopted event, found ${launched.length} and ${adopted.length}`);
    if (path === "migrated") {
      const fees = await attempt("migration-fee", () => events("MigrationFeePaid")) as { args: { payer: Address; feeToken: Address; amount: bigint; treasuryAmount: bigint; claireHolderAmount: bigint } }[] | undefined;
      if (fees) {
        const e = fees[0]?.args;
        add("migration-fee", router.migrationFee === ZERO ? fees.length === 0 : fees.length === 1 && !!e && same(e.payer, router.creator) && same(e.feeToken, router.feeToken)
          && e.amount === router.migrationFee && e.treasuryAmount + e.claireHolderAmount === e.amount,
        router.migrationFee === ZERO ? "The factory charges no migration fee" : fees.length === 1 ? `Creator paid the ${router.migrationFee} migration fee once` : `Expected one MigrationFeePaid event, found ${fees.length}`);
      }
    }
  }
  const registered = await attempt("registration-event", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: input.routerFactory, abi: claireRouterFactoryAbi, eventName: "ClaireLaunchRegistered", args: { token: input.token }, fromBlock, toBlock, strict: true })));
  if (registered) add("registration-event", registered.length === 1 && same(registered[0]!.args.router, launch.router!), registered.length === 1 ? `The router registered the token at block ${registered[0]!.blockNumber}` : `Expected one ClaireLaunchRegistered event, found ${registered.length}`);
  if (pons) add("pool-id", router.stockereumPoolId === zeroHash, "A pons router has no Stockereum pool id");
  else {
    const pools = await attempt("pool-id", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
      address: launch.router!, abi: claireFeeRouterAbi, eventName: "StockereumLaunched", args: { token: input.token }, fromBlock, toBlock, strict: true })));
    if (pools) add("pool-id", pools.length === 1 && pools[0]!.args.poolId === router.stockereumPoolId && router.stockereumPoolId !== zeroHash, pools.length === 1 ? `Stockereum pool ${router.stockereumPoolId}` : `Expected one StockereumLaunched event, found ${pools.length}`);
  }
  if (input.vaultFactory) {
    const kind = await attempt("payee", async () => {
      if (same(router.payee, router.creator)) return "creator" as const;
      const f = { address: input.vaultFactory!, abi: claireVaultFactoryAbi, blockNumber } as const;
      const [vault, split] = await Promise.all([client.readContract({ ...f, functionName: "isVault", args: [router.payee] }), client.readContract({ ...f, functionName: "isSplit", args: [router.payee] })]);
      return vault ? "vault" as const : split ? "split" as const : "other" as const;
    });
    if (kind) { facts.payeeKind = kind; add("payee", true, kind === "creator" ? "The payee is the creator" : kind === "other" ? `The payee ${router.payee} is neither the creator nor a Claire vault or split` : `The payee ${router.payee} is a genuine Claire ${kind} recorded by the vault factory`); }
  }
  return finish(facts);
}

// ------------------------------------------------------------------ router split

/**
 * Recomputes the split of every `Distributed` event in the range and ties the revenue they charged to `totalRevenue`. Each distribution uses the holder share in effect when it happened:
 * the router's `HolderShareRaised` and `PayeeChanged` events are replayed in log order, ending at the router's current `holderBps` and `payee` (`facts.holderShareRaises`, `facts.payeeChanges`).
 * The creator share went to the payee in effect, which is recorded per distribution in `facts.payees`.
 * Revenue is only ever charged in the quote asset and, on pons, the launch token (buyback vests); both are counted and any other asset charged revenue fails.
 * `facts.historical` sums the `HistoricalFeesPaid` amounts of an adopted token (fees and vest earned before adoption, paid to the creator uncharged); they are not revenue and are excluded from `revenue` and `totalRevenue`.
 */
export async function verifyRouterSplit(client: PublicClient, input: { router: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const c = { address: input.router, abi: claireFeeRouterAbi, blockNumber } as const;
  const config = await attempt("router", async () => {
    const [holderBps, bps, claireBps, launched, launchpad, payee] = await Promise.all([
      client.readContract({ ...c, functionName: "holderBps" }), client.readContract({ ...c, functionName: "BPS" }),
      client.readContract({ ...c, functionName: "CLAIRE_SHARE_BPS" }), client.readContract({ ...c, functionName: "launchedToken" }),
      client.readContract({ ...c, functionName: "launchpad" }), client.readContract({ ...c, functionName: "payee" }),
    ]);
    const bound = !same(launched, zeroAddress);
    return { holderBps: BigInt(holderBps), bps: BigInt(bps), claireBps: BigInt(claireBps), payee, quote: bound ? await client.readContract({ ...c, functionName: "quote" }) : null, launchToken: bound && launchpad === 0 ? launched : null };
  });
  const log = config && await attempt("events", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ ...c, fromBlock, toBlock, strict: true })));
  const facts = { router: input.router, blockNumber, distributions: 0, payee: config?.payee ?? null, payees: [] as Address[], holderShareRaises: [] as { blockNumber: bigint; oldBps: number; newBps: number }[], payeeChanges: [] as { blockNumber: bigint; oldPayee: Address; newPayee: Address }[], revenue: new Map<Address, bigint>(), historical: new Map<Address, bigint>(), totalRevenue: new Map<Address, bigint>() };
  if (!config || !log) return finish(facts);
  const events = log.filter((ev) => ev.eventName === "Distributed") as Extract<(typeof log)[number], { eventName: "Distributed" }>[];
  facts.distributions = events.length;
  const problems: string[] = [];
  // The state before the range is the `old` value of its first change, or the current value when nothing changed; every later change must continue from the previous one and end at the current value.
  const raises = log.filter((ev) => ev.eventName === "HolderShareRaised");
  const changes = log.filter((ev) => ev.eventName === "PayeeChanged");
  let holderBps = BigInt(raises[0]?.eventName === "HolderShareRaised" ? raises[0].args.oldBps : config.holderBps), payee = changes[0]?.eventName === "PayeeChanged" ? changes[0].args.oldPayee : config.payee;
  const chain: string[] = [];
  for (const ev of log) {
    if (ev.eventName === "HolderShareRaised") {
      if (BigInt(ev.args.oldBps) !== holderBps || ev.args.newBps <= ev.args.oldBps) chain.push(`holder share at block ${ev.blockNumber}`);
      facts.holderShareRaises.push({ blockNumber: ev.blockNumber, oldBps: ev.args.oldBps, newBps: ev.args.newBps });
      holderBps = BigInt(ev.args.newBps);
    } else if (ev.eventName === "PayeeChanged") {
      if (!same(ev.args.oldPayee, payee)) chain.push(`payee at block ${ev.blockNumber}`);
      facts.payeeChanges.push({ blockNumber: ev.blockNumber, oldPayee: ev.args.oldPayee, newPayee: ev.args.newPayee });
      payee = ev.args.newPayee;
    } else if (ev.eventName === "Distributed") {
      const e = ev.args, at = ev.blockNumber;
      facts.payees.push(payee);
      const claire = e.revenue * config.claireBps / config.bps;
      const holders = e.revenue * holderBps / config.bps;
      const want = [e.received - claire - holders, holders, claire / BigInt(2), claire - claire / BigInt(2)];
      const got = [e.creatorAmount, e.projectHolderAmount, e.claireHolderAmount, e.treasuryAmount];
      let bad = e.revenue > e.received || want.some((value, i) => value !== got[i]);
      // The router's own split() describes its current share, so it can only be compared against distributions made under it.
      if (holderBps === config.holderBps) {
        const onChain = await client.readContract({ ...c, functionName: "split", args: [e.revenue] });
        bad ||= onChain[1] !== holders || onChain[2] !== claire / BigInt(2) || onChain[3] !== claire - claire / BigInt(2) || onChain[0] + (e.received - e.revenue) !== e.creatorAmount;
      }
      if (bad) problems.push(`block ${at}`);
      facts.revenue.set(e.asset, (facts.revenue.get(e.asset) ?? ZERO) + e.revenue);
    }
  }
  if (holderBps !== config.holderBps) chain.push(`holder share ${config.holderBps} is not the last raised share ${holderBps}`);
  if (!same(payee, config.payee)) chain.push(`payee ${config.payee} is not the last applied payee ${payee}`);
  add("split-history", !chain.length, chain.length ? `The router's holder share or payee changes do not chain: ${chain.join("; ")}` : `${facts.holderShareRaises.length} holder share raise(s) and ${facts.payeeChanges.length} payee change(s) lead to the current values`);
  add("split", !problems.length, problems.length ? `${problems.length} distribution(s) differ from the router's split: ${problems.join(", ")}` : `${events.length} distribution(s) match the router's split`);
  if (config.quote) facts.revenue.set(config.quote, facts.revenue.get(config.quote) ?? ZERO);
  if (config.launchToken) facts.revenue.set(config.launchToken, facts.revenue.get(config.launchToken) ?? ZERO);
  const stray = [...facts.revenue].filter(([asset, sum]) => sum > ZERO && !same(asset, config.quote ?? zeroAddress) && !same(asset, config.launchToken ?? zeroAddress)).map(([asset]) => asset);
  add("revenue-assets", !stray.length, stray.length ? `Revenue was charged in unexpected asset(s): ${stray.join(", ")}` : "Revenue was charged only in the quote asset and the pons launch token");
  // Pre-adoption fees and vest paid to the creator (`HistoricalFeesPaid`) are not revenue: they were never charged, are not in `Distributed` and must not be in `totalRevenue`.
  const paid = await attempt("historical", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ ...c, eventName: "HistoricalFeesPaid", fromBlock, toBlock, strict: true })));
  if (paid) {
    for (const { args: e } of paid) facts.historical.set(e.asset, (facts.historical.get(e.asset) ?? ZERO) + e.amount);
    const other = [...facts.historical.keys()].filter((asset) => !same(asset, config.quote ?? zeroAddress) && !same(asset, config.launchToken ?? zeroAddress));
    add("historical", !other.length, other.length ? `Historical fees were paid in unexpected asset(s): ${other.join(", ")}` : `${paid.length} historical payment(s) to the creator, not counted as revenue`);
  }
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

/**
 * Recomputes the vesting schedule and ties the lock to its creation event; flags opening-buy locks funded by the token's Claire router.
 * `facts.cancelState` is the notice-period state; the cancel checks tie `cancelNotice`, `cancelAt` and `canceled` to the lock's `CancelRequested` and `Canceled` events.
 */
export async function verifyLock(client: PublicClient, input: { tokenLock: Address; lockId: bigint; routerFactory?: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const read = await attempt("lock", () => readLock(client, { tokenLock: input.tokenLock, lockId: input.lockId, blockNumber }));
  const facts = { ...input, blockNumber, openingBuy: false, cancelState: null as "not-cancelable" | "cancelable" | "notice-not-requested" | "notice-pending" | "cancel-open" | "canceled" | null, read: read ?? null };
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
      && e.cancelable === lock.cancelable && e.transferable === lock.transferable && e.cancelNotice === lock.cancelNotice && (lock.canceled ? e.amount >= lock.amount : e.amount === lock.amount),
    created.length === 1 ? "LockCreated matches the stored lock" : `Expected one LockCreated event, found ${created.length}`);
  }
  const cancelAt = BigInt(lock.cancelAt), notice = BigInt(lock.cancelNotice);
  facts.cancelState = lock.canceled ? "canceled" : !lock.cancelable ? "not-cancelable" : lock.cancelNotice === 0 ? "cancelable" : lock.cancelAt === 0 ? "notice-not-requested" : t >= cancelAt ? "cancel-open" : "notice-pending";
  add("cancel-config", (lock.cancelNotice === 0 || lock.cancelable) && (lock.cancelAt === 0 || (lock.cancelable && lock.cancelNotice !== 0)) && (!lock.canceled || (lock.cancelable && (lock.cancelNotice === 0 || lock.cancelAt !== 0))),
    `cancelable ${lock.cancelable}, notice ${lock.cancelNotice}s, cancelAt ${lock.cancelAt}, canceled ${lock.canceled}: ${facts.cancelState}`);
  const cancelEvents = await attempt("cancel-events", async () => {
    const lockId = input.lockId;
    const requested = await scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ address: input.tokenLock, abi: claireTokenLockAbi, eventName: "CancelRequested", args: { lockId }, fromBlock, toBlock, strict: true }));
    const canceled = await scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ address: input.tokenLock, abi: claireTokenLockAbi, eventName: "Canceled", args: { lockId }, fromBlock, toBlock, strict: true }));
    return { requested, canceled, requestedAt: requested[0] ? await blockTime(client, requested[0].blockNumber) : ZERO, canceledAt: canceled[0] ? await blockTime(client, canceled[0].blockNumber) : ZERO };
  });
  if (cancelEvents) {
    const { requested, canceled, requestedAt, canceledAt } = cancelEvents;
    const r = requested[0]?.args, k = canceled[0]?.args;
    const requestOk = lock.cancelAt === 0 ? requested.length === 0 : requested.length === 1 && !!r && r.cancelAt === lock.cancelAt && same(r.funder, lock.funder) && requestedAt + notice === cancelAt;
    const cancelOk = !lock.canceled ? canceled.length === 0 : canceled.length === 1 && !!k && same(k.funder, lock.funder) && (lock.cancelNotice === 0 || canceledAt >= cancelAt)
      && !!created?.[0] && created[0].args.amount === lock.amount + k.refunded && k.stillClaimable >= lock.amount - lock.claimed;
    add("cancel-events", requestOk && cancelOk, requestOk && cancelOk ? `${requested.length} CancelRequested and ${canceled.length} Canceled event(s) match the lock's cancel state` : "The lock's cancel state does not match its CancelRequested/Canceled events");
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

/**
 * Rebuilds a `ClairePriceLock` lock's price history from the token's `Sampled` events: the lowest sample of every hour, the window minimum (the lowest hour among the 24 completed hours before
 * a sample; the current hour never counts and every one of the 24 must hold a sample), the `highWater` ratchet (the largest full-window minimum seen at every sample and every lock creation)
 * and the unlocked amount from that `highWater` and the tranches. `highWater` can only be proven by a scan from block 0; a partial scan fails that check. Also ties the lock to its creation event
 * and its custody, and requires the token to be Claire-launched (by `routerFactory` when given, else by the registry the lock itself names).
 */
export async function verifyPriceLock(client: PublicClient, input: { priceLock: Address; lockId: bigint; routerFactory?: Address } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const read = await attempt("lock", () => readPriceLock(client, { priceLock: input.priceLock, lockId: input.lockId, blockNumber }));
  const facts = { ...input, blockNumber, samples: 0, expectedHighWater: null as bigint | null, expectedWindowMin: null as bigint | null, read: read ?? null };
  if (!read) return finish(facts);
  const { lock, tranches, timestamp } = read;
  const c = { address: input.priceLock, abi: clairePriceLockAbi, blockNumber } as const;
  const bpsSum = tranches.reduce((sum, tranche) => sum + tranche.bps, 0);
  add("tranches", tranches.length >= 1 && tranches.length <= 10 && bpsSum === 10_000 && tranches.every((tranche, i) => tranche.bps > 0 && tranche.price > ZERO && (i === 0 || tranche.price > tranches[i - 1]!.price)), `${tranches.length} tranche(s) summing to ${bpsSum} bps, strictly increasing prices`);
  const config = await attempt("registry", async () => {
    const [registry, bucket, buckets] = await Promise.all([
      client.readContract({ ...c, functionName: "registry" }), client.readContract({ ...c, functionName: "BUCKET" }),
      client.readContract({ ...c, functionName: "BUCKETS" }),
    ]);
    return { registry, bucket, buckets, router: await client.readContract({ address: registry, abi: claireRouterFactoryAbi, functionName: "launchRouterOf", args: [lock.token], blockNumber }) };
  });
  if (config) add("claire-launched", !same(config.router, zeroAddress) && (!input.routerFactory || same(config.registry, input.routerFactory)), `Registry ${config.registry} records router ${config.router} for ${lock.token}`);
  const history = config && await attempt("samples", async () => {
    const at = { address: input.priceLock, abi: clairePriceLockAbi, args: { token: lock.token }, strict: true } as const;
    return {
      sampled: await scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ ...at, eventName: "Sampled", fromBlock, toBlock })),
      created: await scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ ...at, eventName: "PriceLockCreated", fromBlock, toBlock })),
    };
  });
  if (config && history) {
    const { bucket, buckets } = config;
    const mins = new Map<bigint, bigint>(); // hour index -> lowest sample so far
    const window = (at: bigint) => {
      let min: bigint | undefined;
      for (let i = BigInt(1); i <= buckets; i++) { // the current, incomplete hour never counts
        const low = mins.get(at / bucket - i);
        if (low === undefined) return { min: ZERO, full: false };
        if (min === undefined || low < min) min = low;
      }
      return { min: min!, full: true };
    };
    const timeline = [...history.sampled.map((e) => ({ kind: "sample" as const, e })), ...history.created.map((e) => ({ kind: "created" as const, e }))]
      .sort((a, b) => Number(a.e.blockNumber - b.e.blockNumber) || a.e.logIndex - b.e.logIndex);
    const complete = from === ZERO;
    const problems: string[] = [];
    let high = ZERO, last: { at: bigint; price: bigint } | null = null;
    for (const entry of timeline) {
      const at = await blockTime(client, entry.e.blockNumber);
      if (entry.kind === "sample") {
        const { price, windowMin, windowFull, highWater } = entry.e.args;
        const low = mins.get(at / bucket);
        mins.set(at / bucket, low !== undefined && low < price ? low : price);
        last = { at, price };
        const w = window(at);
        if (w.full && w.min > high) high = w.min;
        if (complete && (windowMin !== w.min || windowFull !== w.full || highWater !== high)) problems.push(`block ${entry.e.blockNumber}: event window ${windowMin}${windowFull ? "" : " (not full)"}, highWater ${highWater}; recomputed ${w.min}${w.full ? "" : " (not full)"}, highWater ${high}`);
      } else {
        const w = window(at);
        if (w.full && w.min > high) high = w.min;
      }
    }
    facts.samples = history.sampled.length;
    add("samples", !problems.length, problems.length ? problems.slice(0, 5).join("; ") : `${history.sampled.length} sample(s)${complete ? "; every window minimum and highWater is recomputed from them" : ""}`);
    const now = window(timestamp);
    // Samples before a partial scan's start can only lower the true window minimum, so a partial scan bounds it from above.
    add("window", complete ? read.windowMin === now.min && read.windowFull === now.full : !now.full || (read.windowFull && read.windowMin <= now.min), `Window minimum ${read.windowMin}${read.windowFull ? "" : " (not full)"}; recomputed ${now.min}${now.full ? "" : " (not full)"}`);
    add("last-sample", complete ? (last === null ? read.lastSample.at === ZERO && read.lastSample.price === ZERO : read.lastSample.at === last.at && read.lastSample.price === last.price) : last === null || read.lastSample.at >= last.at, last ? `Last sample ${read.lastSample.price} at ${read.lastSample.at}` : "No samples");
    facts.expectedWindowMin = now.min;
    if (complete) facts.expectedHighWater = high;
    add("high-water", complete && read.highWater === high, complete ? `highWater ${read.highWater}; recomputed ${high}` : "highWater cannot be proven without scanning from block 0");
  }
  const bps = tranches.reduce((sum, tranche) => read.highWater >= tranche.price ? sum + BigInt(tranche.bps) : sum, ZERO);
  const unlocked = timestamp >= BigInt(lock.deadline) ? lock.amount : lock.amount * bps / BPS;
  add("unlocked", read.unlocked === unlocked && read.claimable === unlocked - lock.claimed && lock.claimed <= unlocked, `highWater ${read.highWater} unlocks ${bps} bps; unlocked ${unlocked} of ${lock.amount}`);
  const created = await attempt("creation-event", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({
    address: input.priceLock, abi: clairePriceLockAbi, eventName: "PriceLockCreated", args: { lockId: input.lockId }, fromBlock, toBlock, strict: true })));
  if (created) {
    const e = created[0]?.args;
    add("creation-event", created.length === 1 && !!e && same(e.token, lock.token) && same(e.beneficiary, lock.beneficiary) && same(e.funder, lock.funder) && e.amount === lock.amount && e.deadline === lock.deadline && e.tranches.length === tranches.length
      && e.tranches.every((tranche, i) => tranche.price === tranches[i]!.price && tranche.bps === tranches[i]!.bps),
    created.length === 1 ? "PriceLockCreated matches the stored lock and tranches" : `Expected one PriceLockCreated event, found ${created.length}`);
  }
  const held = await attempt("custody", () => Promise.all([
    client.readContract({ address: lock.token, abi: erc20Abi, functionName: "balanceOf", args: [input.priceLock], blockNumber }),
    client.readContract({ ...c, functionName: "locked", args: [lock.token] }),
  ]));
  if (held) add("custody", held[0] >= held[1], `Lock contract holds ${held[0]} of ${lock.token}; ${held[1]} is owed to locks`);
  return finish(facts);
}

// ------------------------------------------------------------------ payees

/**
 * A router payee that is a `ClaireVestingVault`: genuine when the vault factory recorded it (`isVault`, its `VaultDeployed` event) and its CREATE2 `predictVault` from the event's
 * beneficiary, schedule and salt is the vault. For each of `assets` (`zeroAddress` is native ETH), recomputes vested = received * clamp((t - start) / (end - start)) (nothing before the cliff,
 * everything from the end), releasable = vested - released, released <= vested <= received, and ties `released` to the vault's `Released` events.
 */
export async function verifyVestingVault(client: PublicClient, input: { vault: Address; vaultFactory: Address; assets: Address[] } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const read = await attempt("vault", () => readVestingVault(client, { vault: input.vault, assets: input.assets, blockNumber }));
  const facts = { vault: input.vault, vaultFactory: input.vaultFactory, blockNumber, read: read ?? null };
  if (!read) return finish(facts);
  add("schedule", !same(read.beneficiary, zeroAddress) && read.start < read.end && read.start <= read.cliff && read.cliff <= read.end, `beneficiary ${read.beneficiary}, start ${read.start}, cliff ${read.cliff}, end ${read.end}`);
  const f = { address: input.vaultFactory, abi: claireVaultFactoryAbi, blockNumber } as const;
  const deployed = await attempt("genuine", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ address: input.vaultFactory, abi: claireVaultFactoryAbi, eventName: "VaultDeployed", args: { vault: input.vault }, fromBlock, toBlock, strict: true })));
  const registered = deployed && await attempt("genuine", () => client.readContract({ ...f, functionName: "isVault", args: [input.vault] }));
  if (deployed && registered !== undefined) {
    const e = deployed[0]?.args;
    const predicted = e && await attempt("genuine", () => client.readContract({ ...f, functionName: "predictVault", args: [e.beneficiary, e.start, e.cliff, e.end, e.salt] }));
    add("genuine", deployed.length === 1 && registered && !!e && !!predicted && same(predicted, input.vault) && same(e.beneficiary, read.beneficiary) && e.start === read.start && e.cliff === read.cliff && e.end === read.end,
      deployed.length === 1 ? `Vault factory ${input.vaultFactory} deployed this vault at its predicted CREATE2 address` : `Expected one VaultDeployed event, found ${deployed.length}`);
  }
  const t = read.timestamp;
  for (const a of read.assets) {
    const vested = t >= BigInt(read.end) ? a.totalReceived : t < BigInt(read.cliff) ? ZERO : a.totalReceived * (t - BigInt(read.start)) / BigInt(read.end - read.start);
    add(`vested:${a.asset}`, a.vested === vested && a.releasable === (vested > a.released ? vested - a.released : ZERO) && a.released <= a.vested && a.vested <= a.totalReceived,
      `Received ${a.totalReceived}, vested ${a.vested} (recomputed ${vested}), released ${a.released}, releasable ${a.releasable}`);
    const events = await attempt(`released:${a.asset}`, () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ address: input.vault, abi: claireVestingVaultAbi, eventName: "Released", args: { asset: a.asset }, fromBlock, toBlock, strict: true })));
    if (events) {
      const sum = events.reduce((total, e) => total + e.args.amount, ZERO);
      add(`released:${a.asset}`, (from === ZERO ? sum === a.released : sum <= a.released) && events.every((e) => same(e.args.beneficiary, read.beneficiary)), `Released events sum to ${sum}; released ${a.released}`);
    }
  }
  return finish(facts);
}

/**
 * A router payee that is a `ClaireSplit`: genuine when the vault factory recorded it (`isSplit`, its `SplitDeployed` event) and `predictSplit` from the event's payees, bps and salt is the split.
 * Checks 2 to 10 payees with non-zero shares summing to 10,000 bps, and for each of `assets` (`zeroAddress` is native ETH) that every payee's paid amount is at most its share of
 * what was received, its releasable amount is exactly the unpaid remainder, the payees' paid amounts add up to `totalPaid` and `totalPaid` to the `Released` events.
 */
export async function verifySplit(client: PublicClient, input: { split: Address; vaultFactory: Address; assets: Address[] } & ReadAt & ScanOptions) {
  const { add, attempt, finish } = collector();
  const { blockNumber, from, chunk } = await range(client, input);
  const read = await attempt("split", () => readSplit(client, { split: input.split, assets: input.assets, blockNumber }));
  const facts = { split: input.split, vaultFactory: input.vaultFactory, blockNumber, read: read ?? null };
  if (!read) return finish(facts);
  const sum = read.shares.reduce((total, bps) => total + bps, 0);
  add("shares", read.payees.length >= 2 && read.payees.length <= 10 && read.payees.length === read.shares.length && sum === 10_000 && read.shares.every((bps) => bps > 0) && read.payees.every((p) => !same(p, zeroAddress)), `${read.payees.length} payee(s), ${sum} bps`);
  const f = { address: input.vaultFactory, abi: claireVaultFactoryAbi, blockNumber } as const;
  const deployed = await attempt("genuine", () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ address: input.vaultFactory, abi: claireVaultFactoryAbi, eventName: "SplitDeployed", args: { split: input.split }, fromBlock, toBlock, strict: true })));
  const registered = deployed && await attempt("genuine", () => client.readContract({ ...f, functionName: "isSplit", args: [input.split] }));
  if (deployed && registered !== undefined) {
    const e = deployed[0]?.args;
    const predicted = e && await attempt("genuine", () => client.readContract({ ...f, functionName: "predictSplit", args: [e.payees, e.bps, e.salt] }));
    add("genuine", deployed.length === 1 && registered && !!e && !!predicted && same(predicted, input.split) && e.payees.length === read.payees.length && e.payees.every((p, i) => same(p, read.payees[i]!)) && e.bps.every((bps, i) => bps === read.shares[i]),
      deployed.length === 1 ? `Vault factory ${input.vaultFactory} deployed this split at its predicted CREATE2 address` : `Expected one SplitDeployed event, found ${deployed.length}`);
  }
  for (const a of read.assets) {
    const paidSum = a.paid.reduce((total, value) => total + value, ZERO);
    const shareOf = (i: number) => a.totalReceived * BigInt(read.shares[i] ?? 0) / BigInt(10_000);
    add(`paid:${a.asset}`, paidSum === a.totalPaid && a.totalPaid <= a.totalReceived && a.paid.every((value, i) => value <= shareOf(i)) && a.releasable.every((value, i) => value === shareOf(i) - a.paid[i]!),
      `Received ${a.totalReceived}, paid ${a.totalPaid}; releasable ${a.releasable.join(", ")}`);
    const events = await attempt(`released:${a.asset}`, () => scan(from, blockNumber, chunk, (fromBlock, toBlock) => client.getContractEvents({ address: input.split, abi: claireSplitAbi, eventName: "Released", args: { asset: a.asset }, fromBlock, toBlock, strict: true })));
    if (events) {
      const total = events.reduce((acc, e) => acc + e.args.amount, ZERO);
      add(`released:${a.asset}`, (from === ZERO ? total === a.totalPaid : total <= a.totalPaid) && events.every((e) => read.payees.some((p) => same(p, e.args.payee))), `Released events sum to ${total}; totalPaid ${a.totalPaid}`);
    }
  }
  return finish(facts);
}

// ------------------------------------------------------------------ rounds

export type RoundLevel = "manifest" | "balances" | "complete";
type Hole = string | null;
/** The canonical round manifest, version 1 (cumulative): one per published root, listing every account with a cumulative entitlement. */
export type RoundManifest = {
  kind: "claire-round"; version: 1; purpose: "project-holders" | "claire-holders" | "airdrop" | "referrals"; chainId: number; distributor: Address; asset: Address;
  /** Evidence of the previous root for this asset on this distributor; null for the first. */
  previousEvidence: Hex | null;
  /** Raw amount this round adds; `cumulativeTotal` is what the distributor holds in promises after it. */
  total: string; cumulativeTotal: string;
  snapshot: { chainId: number; block: string; token: Address | null };
  rule: { type: "pro-rata"; distributable: string; eligibleBalance: string; excluded: Address[]; minBalance: Hole } | { type: "referral-rewards"; rewards: [Address, string, string[]][] };
  /** Every account with `cumulative > 0`, ascending by account; accounts not in this round carry their cumulative with `amount` "0". */
  leaves: (RoundLeaf & { amount: string; balance: Hole })[];
};

const uint = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
const addr = (value: unknown): value is Address => typeof value === "string" && isAddress(value, { strict: false }) && value === value.toLowerCase();
const MAX_UINT256 = BigInt(2) ** BigInt(256) - BigInt(1);

/** Throws with the first structural problem; the shape is the canonical round manifest, version 1. */
export function parseRoundManifest(text: string): RoundManifest {
  const m = JSON.parse(text) as Record<string, any>;
  const bad = (what: string): never => { throw new Error(`Invalid manifest: ${what}`); };
  if (m.kind !== "claire-round" || m.version !== 1) bad("kind or version");
  if (!["project-holders", "claire-holders", "airdrop", "referrals"].includes(m.purpose)) bad("purpose");
  if (!Number.isInteger(m.chainId) || !addr(m.distributor) || !addr(m.asset) || !uint(m.total) || !uint(m.cumulativeTotal)) bad("chainId, distributor, asset, total or cumulativeTotal");
  if (!(m.previousEvidence === null || (typeof m.previousEvidence === "string" && /^0x[0-9a-f]{64}$/.test(m.previousEvidence)))) bad("previousEvidence");
  if (!Number.isInteger(m.snapshot?.chainId) || !uint(m.snapshot?.block) || !(m.snapshot?.token === null || addr(m.snapshot?.token))) bad("snapshot");
  if (m.rule?.type === "pro-rata") {
    if (!Array.isArray(m.rule.excluded) || !m.rule.excluded.every(addr) || !(m.rule.minBalance === null || uint(m.rule.minBalance)) || !uint(m.rule.distributable) || !uint(m.rule.eligibleBalance) || BigInt(m.rule.eligibleBalance) === ZERO || m.snapshot.token === null) bad("pro-rata rule");
  } else if (m.rule?.type === "referral-rewards") {
    if (!Array.isArray(m.rule.rewards) || !m.rule.rewards.every((r: unknown) => Array.isArray(r) && addr(r[0]) && uint(r[1]) && Array.isArray(r[2]))) bad("referral rewards");
  } else bad("rule type");
  if (!Array.isArray(m.leaves) || !m.leaves.length) bad("leaves");
  m.leaves.forEach((leaf: Record<string, unknown>, i: number) => {
    if (!addr(leaf.account) || !uint(leaf.amount) || !uint(leaf.cumulative) || BigInt(leaf.cumulative) === ZERO || BigInt(leaf.cumulative) > MAX_UINT256 || BigInt(leaf.amount) > BigInt(leaf.cumulative) || !(leaf.balance === null || uint(leaf.balance))) bad(`leaf ${i}`);
    if (i > 0 && !((m.leaves[i - 1].account as string) < (leaf.account as string))) bad(`leaf ${i} is not in ascending account order`);
  });
  return m as RoundManifest;
}


export type VerifyRoundInput = {
  distributor: Address; roundId: bigint; level?: RoundLevel;
  /** The manifest exactly as served. Without it, `manifestBaseUrl` is asked for `/rounds/<chainId>/<distributor>/<evidence>.json`. */
  manifest?: string; manifestBaseUrl?: string;
  /** The previous root's manifest (the one `previousEvidence` names), exactly as served; fetched from `manifestBaseUrl` when omitted. */
  previousManifest?: string;
  /** Client for the snapshot's chain when it differs from the distributor's chain (balances and complete levels). */
  snapshotClient?: PublicClient;
} & ReadAt & ScanOptions;

/**
 * `manifest`: the manifest hashes to the on-chain evidence, its leaves rebuild the on-chain root (leaf = chain, distributor, asset, account, cumulative) and cumulativeTotal, `total` is the increase over the
 * previous root of the asset, `previousEvidence` names that previous root, and (with the previous manifest) every account's cumulative is its previous cumulative plus this round's amount. For the latest root
 * it also checks that no account has claimed more than its cumulative. Only the previous root is chained; verify earlier rounds with their own `verifyRound`.
 * `balances`: adds each leaf balance at the snapshot block, and that every amount is floor(rule.distributable * balance / rule.eligibleBalance) with eligibleBalance covering the listed balances.
 * `complete`: adds a Transfer-log scan up to the snapshot block: after the manifest's exclusions and minimum balance, the eligible balances must sum to rule.eligibleBalance and the leaves are exactly the holders whose share is not zero.
 */
export async function verifyRound(client: PublicClient, input: VerifyRoundInput) {
  const { add, attempt, finish } = collector();
  const level = input.level ?? "manifest";
  const facts = { distributor: input.distributor, roundId: input.roundId, level, evidence: null as Hex | null, previousRoundId: null as bigint | null, manifest: null as RoundManifest | null, distributable: null as bigint | null, eligible: null as number | null };
  const onChain = await attempt("round", () => readRound(client, { distributor: input.distributor, roundId: input.roundId, ...(input.blockNumber === undefined ? {} : { blockNumber: input.blockNumber }) }));
  if (!onChain) return finish(facts);
  const { round } = onChain;
  const chainId = await client.getChainId();
  facts.evidence = round.evidence;
  const d = { address: input.distributor, abi: claireDistributorAbi, blockNumber: onChain.blockNumber } as const;
  const fetchManifest = (evidence: Hex, id: string) => attempt(id, async () => {
    const url = `${input.manifestBaseUrl!.replace(/\/$/, "")}/rounds/${chainId}/${input.distributor.toLowerCase()}/${evidence}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.text();
  });
  let text = input.manifest;
  if (text === undefined && input.manifestBaseUrl) text = await fetchManifest(round.evidence, "manifest-source");
  else if (text === undefined) add("manifest-source", false, "Pass the manifest or a manifestBaseUrl");
  if (text === undefined) return finish(facts);
  add("evidence", manifestEvidence(text) === round.evidence, `keccak256(manifest) ${manifestEvidence(text)}; on-chain evidence ${round.evidence}`);
  let manifest: RoundManifest;
  try { manifest = parseRoundManifest(text); } catch (error) { add("manifest-shape", false, String(error)); return finish(facts); }
  facts.manifest = manifest;
  add("manifest-shape", true, `${manifest.leaves.length} leaves, purpose ${manifest.purpose}`);
  add("round-binding", manifest.chainId === chainId && same(manifest.distributor, input.distributor) && same(manifest.asset, round.asset) && manifest.cumulativeTotal === String(round.cumulativeTotal) && manifest.snapshot.block === String(round.snapshotBlock),
    `Manifest chain ${manifest.chainId}, distributor ${manifest.distributor}, asset ${manifest.asset}, cumulativeTotal ${manifest.cumulativeTotal}, snapshot block ${manifest.snapshot.block}`);
  const sum = manifest.leaves.reduce((total, leaf) => total + BigInt(leaf.amount), ZERO);
  const cumulative = manifest.leaves.reduce((total, leaf) => total + BigInt(leaf.cumulative), ZERO);
  add("total", sum === BigInt(manifest.total) && cumulative === BigInt(round.cumulativeTotal), `Leaf amounts sum to ${sum} (total ${manifest.total}); leaf cumulatives sum to ${cumulative}; on-chain cumulativeTotal ${round.cumulativeTotal}`);
  const hashes = manifest.leaves.map((leaf) => roundLeafHash(chainId, input.distributor, manifest.asset, leaf));
  add("root", merkleRoot(hashes) === round.root, `Rebuilt root ${merkleRoot(hashes)}; on-chain root ${round.root}`);
  const leaf0 = manifest.leaves[0]!;
  const encoded = await attempt("leaf-encoding", () => client.readContract({ ...d, functionName: "leaf", args: [manifest.asset, leaf0.account, BigInt(leaf0.cumulative)] }));
  if (encoded) add("leaf-encoding", encoded === hashes[0], "The distributor's own leaf() agrees with the SDK's leaf hash");

  // The previous root of the same asset, found on-chain: the manifest must chain to its evidence and add exactly the increase of cumulativeTotal.
  const previous = await attempt("previous-link", async () => {
    for (let id = input.roundId - BigInt(1); id >= ZERO; id--) {
      const earlier = await client.readContract({ ...d, functionName: "getRound", args: [id] });
      if (same(earlier.asset, round.asset)) return { id, round: earlier };
    }
    return null;
  });
  if (previous !== undefined) {
    facts.previousRoundId = previous?.id ?? null;
    const delta = BigInt(round.cumulativeTotal) - (previous?.round.cumulativeTotal ?? ZERO);
    add("previous-link", manifest.previousEvidence === (previous?.round.evidence ?? null) && BigInt(manifest.total) === delta,
      previous ? `Previous root of the asset is round ${previous.id} (evidence ${previous.round.evidence}); this round adds ${delta}` : `First root of the asset; this round adds ${delta}`);
    let before = new Map<Address, bigint>();
    let chained = previous === null;
    if (previous) {
      let previousText = input.previousManifest;
      if (previousText === undefined && input.manifestBaseUrl) previousText = await fetchManifest(previous.round.evidence, "previous-manifest");
      else if (previousText === undefined) add("previous-manifest", false, "Pass previousManifest or a manifestBaseUrl to check cumulative continuity");
      if (previousText !== undefined) {
        let earlier: RoundManifest | undefined;
        try { earlier = parseRoundManifest(previousText); } catch (error) { add("previous-manifest", false, String(error)); }
        if (earlier) {
          add("previous-manifest", manifestEvidence(previousText) === previous.round.evidence && earlier.chainId === chainId && same(earlier.distributor, input.distributor) && same(earlier.asset, round.asset) && earlier.cumulativeTotal === String(previous.round.cumulativeTotal) && earlier.snapshot.block === String(previous.round.snapshotBlock)
            && earlier.leaves.reduce((total, leaf) => total + BigInt(leaf.cumulative), ZERO) === previous.round.cumulativeTotal,
          `Previous manifest hashes to round ${previous.id}'s evidence and matches its on-chain cumulativeTotal ${previous.round.cumulativeTotal}`);
          before = new Map(earlier.leaves.map((leaf) => [leaf.account, BigInt(leaf.cumulative)]));
          chained = true;
        }
      }
    }
    if (chained) {
      const now = new Set(manifest.leaves.map((leaf) => leaf.account));
      const broken = manifest.leaves.filter((leaf) => BigInt(leaf.cumulative) !== (before.get(leaf.account) ?? ZERO) + BigInt(leaf.amount));
      const dropped = [...before.keys()].filter((account) => !now.has(account));
      add("continuity", !broken.length && !dropped.length, broken.length || dropped.length
        ? `${broken.length} account(s) whose cumulative is not previous + amount and ${dropped.length} previous account(s) missing from the leaves`
        : `Every account's cumulative is its previous cumulative plus this round's amount, and no previous account was dropped`);
    }
  }

  // Only the latest root of an asset is claimable; what accounts already took from it must fit inside it.
  if (onChain.asset.root === round.root) {
    const taken: bigint[] = [];
    for (let i = 0; i < manifest.leaves.length; i += 25) {
      const batch = await attempt("claims", () => Promise.all(manifest.leaves.slice(i, i + 25).map((leaf) => client.readContract({ ...d, functionName: "claimed", args: [round.asset, leaf.account] }))));
      if (!batch) break;
      taken.push(...batch);
    }
    if (taken.length === manifest.leaves.length) add("claims", taken.every((value, i) => value <= BigInt(manifest.leaves[i]!.cumulative)) && onChain.asset.totalClaimed <= round.cumulativeTotal, `No account has claimed more than its cumulative; ${onChain.asset.totalClaimed} of ${round.cumulativeTotal} claimed`);
  }

  const { rule } = manifest;
  if (rule.type === "referral-rewards") {
    const owed = new Map<string, bigint>();
    for (const [account, amount] of rule.rewards) owed.set(account, (owed.get(account) ?? ZERO) + BigInt(amount));
    const listed = new Set(manifest.leaves.map((leaf) => leaf.account));
    add("rewards", [...owed.keys()].every((account) => listed.has(account as Address)) && manifest.leaves.every((leaf) => (owed.get(leaf.account) ?? ZERO) === BigInt(leaf.amount)), "Each leaf's amount equals the sum of that account's listed rewards (carried-over accounts have none)");
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
  // A leaf with a balance is a snapshot holder; a leaf without one only carries an earlier cumulative and must add nothing.
  const min = rule.minBalance === null ? ZERO : BigInt(rule.minBalance);
  const excluded = new Set(rule.excluded);
  const D = BigInt(rule.distributable), H = BigInt(rule.eligibleBalance);
  facts.distributable = D;
  const eligibleBalance = (account: Address, balance: bigint) => balance > ZERO && balance >= min && !excluded.has(account);
  add("balances", manifest.leaves.every((leaf, i) => leaf.balance === null ? BigInt(leaf.amount) === ZERO : leaf.balance === String(balances[i])), `Leaf balances equal balanceOf at block ${block} on chain ${manifest.snapshot.chainId}; carried-over leaves add nothing`);
  add("exclusions", manifest.leaves.every((leaf, i) => BigInt(leaf.amount) === ZERO || eligibleBalance(leaf.account, balances[i]!)), `${excluded.size} excluded address(es) and holders below the minimum balance receive nothing in this round`);
  if (level === "balances") {
    const shares = manifest.leaves.flatMap((leaf, i) => leaf.balance === null ? [] : [{ amount: BigInt(leaf.amount), balance: balances[i]!, eligible: eligibleBalance(leaf.account, balances[i]!) }]);
    add("pro-rata", H >= shares.reduce((total, share) => share.eligible ? total + share.balance : total, ZERO) && shares.every((share) => share.amount === (share.eligible ? D * share.balance / H : ZERO)), `Every holder leaf is floor(${D} * balance / ${H}), and ${H} covers the listed balances`);
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
  const eligible = [...held].filter(([account, balance]) => eligibleBalance(account, balance));
  facts.eligible = eligible.length;
  const scanned = eligible.reduce((total, [, balance]) => total + balance, ZERO);
  const listed = new Set(manifest.leaves.map((leaf) => leaf.account));
  // Holders whose share rounds to zero have no leaf of their own (they may still carry one), so membership is checked against the recomputed shares.
  const missing = eligible.filter(([account, balance]) => !listed.has(account) && D * balance / H !== ZERO);
  const wrong = manifest.leaves.filter((leaf) => {
    const b = held.get(leaf.account) ?? ZERO;
    return BigInt(leaf.amount) !== (eligibleBalance(leaf.account, b) ? D * b / H : ZERO) || (leaf.balance !== null && BigInt(leaf.balance) !== b);
  });
  add("complete", scanned === H && !missing.length && !wrong.length, scanned !== H
    ? `Scanned eligible balance ${scanned} differs from the manifest's ${H}`
    : missing.length || wrong.length
      ? `${missing.length} eligible holder(s) missing and ${wrong.length} leaf(s) inconsistent with the scanned balances`
      : `${eligible.length} eligible holder(s) hold ${H}; every leaf is floor(${D} * balance / ${H})`);
  return finish(facts);
}
