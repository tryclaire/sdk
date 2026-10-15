// Deploys the real Claire contracts and the protocol's launchpad mocks (artifacts.json, synced from the protocol build by
// `npm run sync-abis`) to local anvil chains, then runs every verifier against them, including tampered and forged
// inputs. anvil must be on PATH.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { createPublicClient, createTestClient, createWalletClient, getAddress, getContractAddress, http, keccak256, toHex, zeroHash } from "viem";
import {
  claireDistributorAbi, claireFeeRouterAbi, claireRevenueLockAbi, claireRouterFactoryAbi, claireTokenLockAbi,
  manifestEvidence, merkleProof, merkleRoot, readLaunch, readLock, readRevenueLock, readRound, readRouter, roundLeafHash,
  verifyLaunch, verifyLock, verifyRevenueLock, verifyRound, verifyRouterSplit,
} from "../../dist/protocol/index.js";

const artifacts = JSON.parse(readFileSync(new URL("./artifacts.json", import.meta.url), "utf8"));
const artifact = (_file, name) => artifacts[name];
const mocks = (name) => artifacts[name];
const failed = (result) => result.checks.filter((check) => !check.ok).map((check) => check.id);
const passes = (result, what) => assert.ok(result.ok, `${what}: ${JSON.stringify(result.checks.filter((check) => !check.ok))}`);

const freePort = () => new Promise((resolve) => { const server = createServer().listen(0, () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const anvils = [];
async function startChain(chainId) {
  const port = await freePort();
  const child = spawn("anvil", ["--port", String(port), "--chain-id", String(chainId), "--accounts", "12", "--silent"], { stdio: "ignore" });
  anvils.push(child);
  const url = `http://127.0.0.1:${port}`;
  const pub = createPublicClient({ transport: http(url) });
  for (let i = 0; ; i++) {
    try { await pub.getChainId(); break; } catch (error) { if (i > 100) throw error; await new Promise((r) => setTimeout(r, 100)); }
  }
  const chain = { chainId, pub, wallet: createWalletClient({ transport: http(url) }), admin: createTestClient({ mode: "anvil", transport: http(url) }) };
  chain.accounts = await chain.wallet.getAddresses();
  chain.send = async (address, abi, functionName, args = [], { from = chain.accounts[0], value } = {}) => {
    const hash = await chain.wallet.writeContract({ address, abi, functionName, args, account: from, chain: null, ...(value === undefined ? {} : { value }) });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", functionName);
    return receipt;
  };
  chain.deploy = async ({ abi, bytecode }, args = [], from = chain.accounts[0]) => {
    const hash = await chain.wallet.deployContract({ abi, bytecode, args, account: from, chain: null });
    return getAddress((await pub.waitForTransactionReceipt({ hash })).contractAddress);
  };
  return chain;
}

const world = {};
before(async () => {
  const [a, b] = [await startChain(31337), await startChain(31338)];
  Object.assign(world, { a, b });
  const [deployer, creator, publisher, treasury, clairePublisher, holderA, holderB, holderC, holderD, keeper, operator] = a.accounts;
  Object.assign(world, { deployer, creator, publisher, clairePublisher, treasury, holderA, holderB, holderC, holderD, keeper });

  // Launchpad mocks, tokens and the Claire contracts. The router factory needs its token lock's address, so the lock's nonce is predicted.
  const escrow = await a.deploy(mocks("MockPonsEscrow"));
  const ponsFactory = await a.deploy(mocks("MockPonsFactory"), [escrow]);
  const launchRouter = await a.deploy(mocks("MockPonsLaunchRouter"), [ponsFactory]);
  await a.send(ponsFactory, mocks("MockPonsFactory").abi, "setForwarder", [launchRouter]);
  await a.send(ponsFactory, mocks("MockPonsFactory").abi, "setHook", [await a.deploy(mocks("MockPonsHook"), [escrow, operator])]);
  const stockEscrow = await a.deploy(mocks("MockStockereumEscrow"));
  const stockFactory = await a.deploy(mocks("MockStockereumFactory"), [stockEscrow]);
  const feeToken = await a.deploy(mocks("DecimalToken"), [6]);
  const pair = await a.deploy(mocks("DecimalToken"), [6]);
  const claireHolders = await a.deploy({ abi: claireDistributorAbi, bytecode: artifact("ClaireDistributor", "ClaireDistributor").bytecode }, [clairePublisher, keccak256(toHex("claire-holders"))]);
  const nonce = await a.pub.getTransactionCount({ address: deployer });
  const tokenLock = getContractAddress({ from: deployer, nonce: nonce + 1 });
  const factoryArgs = [claireHolders, treasury, { ponsFactory, ponsEscrow: escrow, ponsLaunchRouter: launchRouter, stockereumFactory: stockFactory, stockereumEscrow: stockEscrow }, feeToken, 10_000_000n, tokenLock];
  const factoryArtifact = { abi: claireRouterFactoryAbi, bytecode: artifact("ClaireRouterFactory", "ClaireRouterFactory").bytecode };
  const routerFactory = await a.deploy(factoryArtifact, factoryArgs);
  assert.equal(await a.deploy({ abi: claireTokenLockAbi, bytecode: artifact("ClaireTokenLock", "ClaireTokenLock").bytecode }, [routerFactory, feeToken, 25_000_000n, treasury, claireHolders]), tokenLock);
  const revenueLock = await a.deploy({ abi: claireRevenueLockAbi, bytecode: artifact("ClaireRevenueLock", "ClaireRevenueLock").bytecode }, [routerFactory]);
  Object.assign(world, { escrow, ponsFactory, feeToken, pair, claireHolders, routerFactory, tokenLock, revenueLock, factoryArtifact, factoryArgs, mocks: { curve: mocks("MockPonsCurve"), factory: mocks("MockPonsFactory"), token: mocks("DecimalToken") } });

  await a.send(feeToken, mocks("DecimalToken").abi, "mint", [creator, 1_000_000_000n]);
  await a.send(pair, mocks("DecimalToken").abi, "mint", [creator, 1_000_000_000_000n]);
});
after(() => anvils.forEach((child) => child.kill()));

/** Deploys a router through `factory` and launches its token with 1000 bought tokens; `lock` locks the opening buy. */
async function launch(factory, holderBps, salt, lock) {
  const { a, creator, publisher, feeToken, pair } = world;
  const abi = claireRouterFactoryAbi;
  const [router] = await a.pub.readContract({ address: factory, abi, functionName: "predict", args: [0, creator, publisher, holderBps, salt] });
  await a.send(factory, abi, "deploy", [0, creator, publisher, holderBps, salt]);
  await a.send(feeToken, world.mocks.token.abi, "approve", [router, 10_000_000n], { from: creator });
  await a.send(pair, world.mocks.token.abi, "approve", [router, 1_000_000n], { from: creator });
  const params = {
    name: "Lumen", symbol: "LUMEN", logo: "", description: "", socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
    creatorFeeRecipient: router, creatorTaxBps: 300, buybackEnabled: false, expectedEconomics: zeroHash, salt,
  };
  const receipt = await a.send(router, claireFeeRouterAbi, "launchPons", [params, 0n, pair, 1_000_000n, 0n, [], lock], { from: creator, value: 500_000_000_000_000n });
  const token = await a.pub.readContract({ address: router, abi: claireFeeRouterAbi, functionName: "launchedToken" });
  return { router, token, receipt };
}

async function accrueAndHarvest(router, fee, tax) {
  const { a, pair } = world;
  const curve = await a.pub.readContract({ address: router, abi: claireFeeRouterAbi, functionName: "curve" });
  await a.send(pair, world.mocks.token.abi, "mint", [curve, fee + tax]);
  await a.send(curve, world.mocks.curve.abi, "accrueToken", [fee, tax]);
  return a.send(router, claireFeeRouterAbi, "harvest", [pair], { from: world.keeper });
}

test("launches: a locked opening buy, a plain launch and a forged router", async () => {
  const { a, creator, routerFactory, tokenLock, pair } = world;
  const now = (await a.pub.getBlock()).timestamp;
  const schedule = { start: Number(now), cliff: Number(now) + 100, end: Number(now) + 1000, transferable: false };
  const locked = await launch(routerFactory, 5000, keccak256(toHex("a")), schedule);
  const plain = await launch(routerFactory, 5000, keccak256(toHex("b")), { start: 0, cliff: 0, end: 0, transferable: false });
  Object.assign(world, { locked, plain });

  const result = await verifyLaunch(a.pub, { token: locked.token, routerFactory, tokenLock });
  passes(result, "locked launch");
  assert.equal(result.facts.router.toLowerCase(), locked.router.toLowerCase());
  assert.equal(result.facts.launchBlock, locked.receipt.blockNumber);
  passes(await verifyLaunch(a.pub, { token: plain.token, routerFactory, tokenLock, chunk: 2n }), "plain launch, small scan chunks");
  assert.equal((await readLaunch(a.pub, { token: plain.token, routerFactory })).routerFacts.quote.toLowerCase(), pair.toLowerCase());
  assert.equal((await readRouter(a.pub, plain.router)).totalRevenue, 0n);

  // A router from an attacker's own factory launches a token; the real factory never registered it.
  const attackerFactory = await a.deploy(world.factoryArtifact, world.factoryArgs);
  const forged = await launch(attackerFactory, 0, keccak256(toHex("c")), { start: 0, cliff: 0, end: 0, transferable: false });
  assert.ok(failed(await verifyLaunch(a.pub, { token: forged.token, routerFactory })).includes("registered"));
  passes(await verifyLaunch(a.pub, { token: forged.token, routerFactory: attackerFactory }), "attacker factory is self-consistent");
  assert.ok(failed(await verifyLaunch(a.pub, { token: locked.token, routerFactory, tokenLock: creator })).includes("token-lock"));
  assert.equal((await verifyLaunch(a.pub, { token: locked.token, routerFactory: creator })).ok, false, "an address that is not a factory fails instead of throwing");
});

test("verifyRouterSplit recomputes every distribution and ties revenue to totalRevenue", async () => {
  const { a, plain } = world;
  await accrueAndHarvest(plain.router, 1_000_000n, 500_000n);
  const first = (await a.pub.getBlock()).number;
  const result = await verifyRouterSplit(a.pub, { router: plain.router, chunk: 3n });
  passes(result, "router split");
  assert.equal(result.facts.distributions, 1);
  assert.equal(result.facts.totalRevenue.get(world.pair), 1_200_000n);
  // A scan that starts later can only be a lower bound, and a non-router fails cleanly.
  passes(await verifyRouterSplit(a.pub, { router: plain.router, fromBlock: first + 1n }), "partial range");
  assert.equal((await verifyRouterSplit(a.pub, { router: world.creator })).ok, false);
});

test("verifyLock: opening-buy lock, creator lock, vesting over time and a missed creation event", async () => {
  const { a, creator, routerFactory, tokenLock, locked, plain } = world;
  const opening = await verifyLock(a.pub, { tokenLock, lockId: 0n, routerFactory });
  passes(opening, "opening-buy lock");
  assert.equal(opening.facts.openingBuy, true);
  assert.equal(opening.facts.read.lock.cancelable, false);
  assert.equal(opening.facts.read.lock.amount, 1000n * 10n ** 18n);

  await a.admin.increaseTime({ seconds: 500 });
  await a.admin.mine({ blocks: 1 });
  const vesting = await verifyLock(a.pub, { tokenLock, lockId: 0n, routerFactory });
  passes(vesting, "vesting after 500s");
  assert.ok(vesting.facts.read.vested > 0n && vesting.facts.read.vested < vesting.facts.read.lock.amount);
  assert.equal((await readLock(a.pub, { tokenLock, lockId: 0n })).lock.funder.toLowerCase(), locked.router.toLowerCase());

  const tokenAbi = world.mocks.token.abi;
  await a.send(plain.token, tokenAbi, "approve", [tokenLock, 100n * 10n ** 18n], { from: creator });
  const ts = Number((await a.pub.getBlock()).timestamp);
  const receipt = await a.send(tokenLock, claireTokenLockAbi, "createLocks", [plain.token, { start: ts, cliff: ts + 50, end: ts + 5000, cancelable: true, transferable: true }, [{ beneficiary: world.holderA, amount: 100n * 10n ** 18n }]], { from: creator });
  const own = await verifyLock(a.pub, { tokenLock, lockId: 1n, routerFactory });
  passes(own, "creator-funded lock");
  assert.equal(own.facts.openingBuy, false);
  assert.ok(failed(await verifyLock(a.pub, { tokenLock, lockId: 1n, fromBlock: receipt.blockNumber + 1n })).includes("creation-event"));
  assert.equal((await verifyLock(a.pub, { tokenLock, lockId: 9n })).ok, false, "an unknown lock fails instead of throwing");
});

test("verifyRevenueLock recomputes tranches, baseline and unlocked amounts", async () => {
  const { a, creator, plain, revenueLock } = world;
  const tokenAbi = world.mocks.token.abi;
  const amount = 200n * 10n ** 18n;
  await a.send(plain.token, tokenAbi, "approve", [revenueLock, amount], { from: creator });
  const deadline = Number((await a.pub.getBlock()).timestamp) + 100_000;
  const created = await a.send(revenueLock, claireRevenueLockAbi, "createLocks", [plain.token, [{ revenue: 1_000_000n, bps: 4000 }, { revenue: 2_000_000n, bps: 6000 }], deadline, [{ beneficiary: world.holderB, amount }]], { from: creator });

  let result = await verifyRevenueLock(a.pub, { revenueLock, lockId: 0n });
  passes(result, "fresh revenue lock");
  assert.equal(result.facts.read.unlocked, 0n);
  assert.equal(result.facts.read.lock.baseline, 1_200_000n);

  await accrueAndHarvest(plain.router, 1_000_000n, 500_000n);
  result = await verifyRevenueLock(a.pub, { revenueLock, lockId: 0n });
  passes(result, "after revenue");
  assert.equal(result.facts.read.earned, 1_200_000n);
  assert.equal(result.facts.read.unlocked, amount * 4000n / 10_000n);
  assert.equal((await readRevenueLock(a.pub, { revenueLock, lockId: 0n })).tranches.length, 2);
  passes(await verifyRouterSplit(a.pub, { router: plain.router }), "router split after two distributions");
  assert.equal((await verifyRouterSplit(a.pub, { router: plain.router })).facts.distributions, 2);

  assert.ok(failed(await verifyRevenueLock(a.pub, { revenueLock, lockId: 0n, fromBlock: created.blockNumber + 1n })).includes("creation-event"));
  assert.equal((await verifyRevenueLock(a.pub, { revenueLock: creator, lockId: 0n })).ok, false);
  // The deadline releases everything regardless of revenue.
  await a.admin.increaseTime({ seconds: 100_001 });
  await a.admin.mine({ blocks: 1 });
  result = await verifyRevenueLock(a.pub, { revenueLock, lockId: 0n });
  passes(result, "after the deadline");
  assert.equal(result.facts.read.unlocked, amount);
});

// ------------------------------------------------------------------ rounds

const lower = (address) => address.toLowerCase();
/** Splits `available` pro rata to `held` (the app's documented formula); a holder whose share is zero gets no leaf. */
const shares = (available, balances) => {
  const held = balances.reduce((sum, [, balance]) => sum + balance, 0n);
  return balances.map(([account, balance]) => ({ account, balance, amount: available * balance / held })).filter((entry) => entry.amount > 0n);
};

async function setupSnapshot(chain) {
  const { deployer, holderA, holderB, holderC, holderD } = world;
  const token = artifact("LocalClaireToken", "LocalClaireToken");
  const address = await chain.deploy(token, [deployer, 1_000_000n * 10n ** 18n]);
  for (const [to, amount] of [[holderA, 600_000n * 10n ** 18n + 7n], [holderB, 300_000n * 10n ** 18n + 3n], [holderC, 70_001n * 10n ** 18n], [holderD, 1n]]) await chain.send(address, token.abi, "transfer", [to, amount]);
  const block = await chain.pub.getBlockNumber({ cacheTime: 0 });
  // Movements after the snapshot must not affect it.
  await chain.send(address, token.abi, "transfer", [world.keeper, 1000n * 10n ** 18n], { from: holderA });
  const balances = [];
  for (const account of [holderA, holderB, holderC, holderD]) balances.push([account, await chain.pub.readContract({ address, abi: token.abi, functionName: "balanceOf", args: [account], blockNumber: block })]);
  return { address, block, balances };
}

async function publish(snapshot, { drop = [], lie = false, inflate = 1n, purpose = "claire-holders" } = {}) {
  const { a, clairePublisher: publisher, claireHolders, pair } = world;
  await a.send(pair, world.mocks.token.abi, "mint", [claireHolders, 1_000_001n]);
  const roundId = await a.pub.readContract({ address: claireHolders, abi: claireDistributorAbi, functionName: "roundCount" });
  const available = await a.pub.readContract({ address: claireHolders, abi: claireDistributorAbi, functionName: "unreserved", args: [pair] });
  const listed = snapshot.balances.filter(([account]) => !drop.includes(account));
  const entries = shares(available, listed);
  const held = listed.reduce((sum, [, balance]) => sum + balance, 0n);
  const leaves = entries.map((entry, index) => ({ index, account: lower(entry.account), amount: String(entry.amount), balance: String(lie && index === 0 ? entry.balance + 1n : entry.balance) }));
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0n);
  const text = JSON.stringify({
    kind: "claire-round", version: 1, purpose, chainId: a.chainId, distributor: lower(claireHolders), asset: lower(pair), total: String(total),
    snapshot: { chainId: snapshot.chain.chainId, block: String(snapshot.block), token: lower(snapshot.address) },
    rule: { type: "pro-rata", distributable: String(available * inflate), eligibleBalance: String(held), excluded: [lower(world.deployer)], minBalance: null }, leaves,
  });
  const root = merkleRoot(leaves.map((leaf) => roundLeafHash(a.chainId, claireHolders, roundId, leaf)));
  await a.send(claireHolders, claireDistributorAbi, "publishRound", [roundId, pair, total, root, snapshot.block, manifestEvidence(text)], { from: publisher });
  return { roundId, text, leaves, entries, available, total };
}

test("verifyRound: honest rounds pass every level, same chain and cross chain", async () => {
  const { a, b, claireHolders, keeper, pair } = world;
  const sameChain = { chain: a, ...await setupSnapshot(a) };
  const crossChain = { chain: b, ...await setupSnapshot(b) };
  Object.assign(world, { sameChain, crossChain });

  const same = await publish(sameChain);
  assert.equal(same.leaves.length, 3, "the 1 wei holder rounds to zero and gets no leaf");
  for (const level of ["manifest", "balances", "complete"]) passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: same.roundId, level, manifest: same.text, chunk: 4n }), `same chain ${level}`);

  const cross = await publish(crossChain);
  passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: cross.roundId, manifest: cross.text }), "cross chain manifest");
  const noClient = await verifyRound(a.pub, { distributor: claireHolders, roundId: cross.roundId, level: "balances", manifest: cross.text });
  assert.ok(failed(noClient).includes("snapshot-chain"), "a snapshot on another chain needs that chain's client");
  const complete = await verifyRound(a.pub, { distributor: claireHolders, roundId: cross.roundId, level: "complete", manifest: cross.text, snapshotClient: b.pub });
  passes(complete, "cross chain complete");
  assert.equal(complete.facts.eligible, 4);

  // The SDK's leaf hashes and proofs are exactly what the deployed distributor accepts.
  const leafHashes = same.leaves.map((leaf) => roundLeafHash(a.chainId, claireHolders, same.roundId, leaf));
  const before = await a.pub.readContract({ address: pair, abi: world.mocks.token.abi, functionName: "balanceOf", args: [same.leaves[1].account] });
  await a.send(claireHolders, claireDistributorAbi, "claim", [same.roundId, 1n, same.leaves[1].account, BigInt(same.leaves[1].amount), merkleProof(leafHashes, 1)], { from: keeper });
  assert.equal(await a.pub.readContract({ address: pair, abi: world.mocks.token.abi, functionName: "balanceOf", args: [same.leaves[1].account] }), before + BigInt(same.leaves[1].amount));
  assert.equal((await readRound(a.pub, { distributor: claireHolders, roundId: same.roundId })).round.evidence, manifestEvidence(same.text));
});

test("verifyRound: tampered, incomplete and misreported manifests fail", async () => {
  const { a, claireHolders, sameChain } = world;
  const honest = await publish(sameChain);
  const base = { distributor: claireHolders, roundId: honest.roundId, manifest: honest.text };
  passes(await verifyRound(a.pub, { ...base, level: "complete" }), "honest control");

  // Any change to the served text breaks the evidence hash, and a changed amount also breaks the Merkle root.
  const tampered = honest.text.replace(`"amount":"${honest.leaves[0].amount}"`, `"amount":"${BigInt(honest.leaves[0].amount) + 1n}"`);
  assert.notEqual(tampered, honest.text);
  const bad = await verifyRound(a.pub, { ...base, manifest: tampered });
  assert.ok(failed(bad).includes("evidence") && failed(bad).includes("root") && failed(bad).includes("total"), failed(bad).join());
  assert.ok(failed(await verifyRound(a.pub, { ...base, manifest: `${honest.text} ` })).join() === "evidence", "even whitespace changes the evidence");
  assert.ok(failed(await verifyRound(a.pub, { ...base, manifest: "not json" })).includes("manifest-shape"));
  assert.ok(failed(await verifyRound(a.pub, { ...base, roundId: 99n })).includes("round"));
  assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId })).includes("manifest-source"));

  // A publisher who omits a holder still publishes a self-consistent manifest; only the holder scan exposes it.
  const omitted = await publish(sameChain, { drop: [world.holderC] });
  passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: omitted.roundId, manifest: omitted.text }), "omitted holder, manifest level");
  passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: omitted.roundId, manifest: omitted.text, level: "balances" }), "omitted holder, balances level");
  assert.deepEqual(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: omitted.roundId, manifest: omitted.text, level: "complete" })), ["complete"]);

  // A misreported balance is caught against the token at the snapshot block.
  const lied = await publish(sameChain, { lie: true });
  passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: lied.roundId, manifest: lied.text }), "misreported balance, manifest level");
  assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: lied.roundId, manifest: lied.text, level: "balances" })).includes("balances"));

  // A distributable total that does not reproduce the amounts is caught as soon as the balances are known.
  const inflated = await publish(sameChain, { inflate: 2n });
  assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: inflated.roundId, manifest: inflated.text, level: "balances" })).includes("pro-rata"));

  // A scan that starts after the token's first transfers cannot account for its supply.
  const late = await verifyRound(a.pub, { ...base, level: "complete", fromBlock: sameChain.block });
  assert.ok(failed(late).includes("scan-supply"));
});

test("verifyRound: manifests are fetched by evidence hash and referral rounds check their rewards", async () => {
  const { a, claireHolders, clairePublisher: publisher, pair, holderA, holderB } = world;
  const honest = await publish(world.sameChain);
  const { createServer: serve } = await import("node:http");
  const server = serve((request, response) => {
    const ok = request.url === `/rounds/${a.chainId}/${lower(claireHolders)}/${manifestEvidence(honest.text)}.json`;
    response.writeHead(ok ? 200 : 404, { "content-type": "application/json" }).end(ok ? honest.text : "{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const manifestBaseUrl = `http://127.0.0.1:${server.address().port}/`;
    passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId, manifestBaseUrl }), "fetched manifest");
    assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId - 1n, manifestBaseUrl })).includes("manifest-source"));
  } finally { server.close(); }

  await a.send(pair, world.mocks.token.abi, "mint", [claireHolders, 700n]);
  const roundId = await a.pub.readContract({ address: claireHolders, abi: claireDistributorAbi, functionName: "roundCount" });
  const rewards = [[lower(holderA), "300", ["1", "2"]], [lower(holderB), "250", ["3"]], [lower(holderA), "150", ["4"]]];
  const leaves = [{ index: 0, account: lower(holderA), amount: "450", balance: null }, { index: 1, account: lower(holderB), amount: "250", balance: null }];
  const text = JSON.stringify({
    kind: "claire-round", version: 1, purpose: "referrals", chainId: a.chainId, distributor: lower(claireHolders), asset: lower(pair), total: "700",
    snapshot: { chainId: a.chainId, block: "1", token: null }, rule: { type: "referral-rewards", rewards }, leaves,
  });
  const root = merkleRoot(leaves.map((leaf) => roundLeafHash(a.chainId, claireHolders, roundId, leaf)));
  await a.send(claireHolders, claireDistributorAbi, "publishRound", [roundId, pair, 700n, root, 1n, manifestEvidence(text)], { from: publisher });
  passes(await verifyRound(a.pub, { distributor: claireHolders, roundId, level: "complete", manifest: text }), "referral round");
});
