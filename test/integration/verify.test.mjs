// Deploys the real Claire contracts and the protocol's launchpad mocks (artifacts.json, synced from the protocol build by
// `npm run sync-abis`) to local anvil chains, then runs every verifier against them, including tampered and forged
// inputs. anvil must be on PATH.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { createPublicClient, createTestClient, createWalletClient, encodeAbiParameters, getAddress, getContractAddress, http, keccak256, toHex, zeroAddress, zeroHash } from "viem";
import {
  claireDistributorAbi, claireDistributorFactoryAbi, claireFeeRouterAbi, clairePriceLockAbi, claireProofViewAbi, claireRevenueLockAbi, claireRouterDeployerAbi, claireRouterFactoryAbi, claireSplitAbi, claireTokenLockAbi, claireVaultFactoryAbi, claireVestingVaultAbi,
  manifestEvidence, merkleProof, merkleRoot, readLaunch, readLock, readPriceLock, readProof, readRevenueLock, readRound, readRouter, readSplit, readVestingVault, roundLeafHash,
  verifyLaunch, verifyLock, verifyPriceLock, verifyRevenueLock, verifyRound, verifyRouterSplit, verifySplit, verifyVestingVault,
} from "../../dist/protocol/index.js";

const artifacts = JSON.parse(readFileSync(new URL("./artifacts.json", import.meta.url), "utf8"));
/** The real contract's ABI from the SDK with its bytecode from the protocol build. */
const real = (name, abi) => ({ abi, bytecode: artifacts[name].bytecode });
const mock = (name) => artifacts[name];
const failed = (result) => result.checks.filter((check) => !check.ok).map((check) => check.id);
const passes = (result, what) => assert.ok(result.ok, `${what}: ${JSON.stringify(result.checks.filter((check) => !check.ok))}`);
const lower = (address) => address.toLowerCase();
const slotOf = (key, slot) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [key, BigInt(slot)]));
const word = (value) => toHex(value, { size: 32 });
const E18 = 10n ** 18n;

const freePort = () => new Promise((resolve) => { const server = createServer().listen(0, () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const anvils = [];
async function startChain(chainId) {
  const port = await freePort();
  const child = spawn("anvil", ["--port", String(port), "--chain-id", String(chainId), "--accounts", "12", "--silent"], { stdio: "ignore" });
  anvils.push(child);
  const url = `http://127.0.0.1:${port}`;
  const pub = createPublicClient({ transport: http(url), pollingInterval: 25 });
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
  chain.warp = async (seconds) => { await chain.admin.increaseTime({ seconds }); await chain.admin.mine({ blocks: 1 }); };
  chain.now = async () => Number((await pub.getBlock()).timestamp);
  return chain;
}

const world = {};
const tokenAbi = () => mock("DecimalToken").abi;
before(async () => {
  const [a, b] = [await startChain(31337), await startChain(31338)];
  Object.assign(world, { a, b });
  const [deployer, creator, publisher, treasury, clairePublisher, holderA, holderB, holderC, holderD, keeper, operator, locker] = a.accounts;
  Object.assign(world, { deployer, creator, publisher, clairePublisher, treasury, holderA, holderB, holderC, holderD, keeper, locker });

  // Launchpad mocks, tokens and the Claire contracts. The router factory needs its token lock's address, so the lock's nonce is predicted.
  const escrow = await a.deploy(mock("MockPonsEscrow"));
  const ponsFactory = await a.deploy(mock("MockPonsFactory"), [escrow]);
  const launchRouter = await a.deploy(mock("MockPonsLaunchRouter"), [ponsFactory]);
  await a.send(ponsFactory, mock("MockPonsFactory").abi, "setForwarder", [launchRouter]);
  await a.send(ponsFactory, mock("MockPonsFactory").abi, "setHook", [await a.deploy(mock("MockPonsHook"), [escrow, operator])]);
  const buybackVault = await a.deploy(mock("MockPonsBuybackVault"), [escrow]);
  const stockEscrow = await a.deploy(mock("MockStockereumEscrow"));
  const stockFactory = await a.deploy(mock("MockStockereumFactory"), [stockEscrow]);
  const feeToken = await a.deploy(mock("DecimalToken"), [6]);
  const pair = await a.deploy(mock("DecimalToken"), [6]);
  const distributorFactory = await a.deploy(real("ClaireDistributorFactory", claireDistributorFactoryAbi));
  const routerDeployer = await a.deploy(real("ClaireRouterDeployer", claireRouterDeployerAbi));
  const vaultFactory = await a.deploy(real("ClaireVaultFactory", claireVaultFactoryAbi));
  const claireHolders = await a.deploy(real("ClaireDistributor", claireDistributorAbi), [clairePublisher, keccak256(toHex("claire-holders")), 0]);
  const nonce = await a.pub.getTransactionCount({ address: deployer });
  const tokenLock = getContractAddress({ from: deployer, nonce: nonce + 1 });
  const launchpads = { ponsFactory, ponsEscrow: escrow, ponsLaunchRouter: launchRouter, ponsBuybackVault: buybackVault, stockereumFactory: stockFactory, stockereumEscrow: stockEscrow };
  const factoryArgs = [claireHolders, treasury, launchpads, feeToken, 10_000_000n, 25_000_000n, tokenLock, distributorFactory, routerDeployer];
  const factoryArtifact = real("ClaireRouterFactory", claireRouterFactoryAbi);
  const routerFactory = await a.deploy(factoryArtifact, factoryArgs);
  assert.equal(await a.deploy(real("ClaireTokenLock", claireTokenLockAbi), [routerFactory, feeToken, 25_000_000n, treasury, claireHolders]), tokenLock);
  const revenueLock = await a.deploy(real("ClaireRevenueLock", claireRevenueLockAbi), [routerFactory]);
  const poolManager = await a.deploy(mock("MockPoolManager"));
  const priceLock = await a.deploy(real("ClairePriceLock", clairePriceLockAbi), [routerFactory, poolManager, poolManager]);
  const proofView = await a.deploy(real("ClaireProofView", claireProofViewAbi), [routerFactory, tokenLock, revenueLock, priceLock, locker]);
  Object.assign(world, { escrow, ponsFactory, buybackVault, feeToken, pair, claireHolders, vaultFactory, routerFactory, routerDeployer, tokenLock, revenueLock, priceLock, proofView, poolManager, factoryArtifact, factoryArgs });

  await a.send(feeToken, tokenAbi(), "mint", [creator, 1_000_000_000n]);
  await a.send(pair, tokenAbi(), "mint", [creator, 1_000_000_000_000n]);
});
after(() => anvils.forEach((child) => child.kill()));

/** Deploys a router through `factory` and launches its token with 1000 bought tokens; `lock` locks the opening buy. */
async function launch(factory, holderBps, salt, lock, { payee = world.creator, buyback = false } = {}) {
  const { a, creator, publisher, feeToken, pair } = world;
  const abi = claireRouterFactoryAbi;
  const [router] = await a.pub.readContract({ address: factory, abi, functionName: "predict", args: [0, creator, payee, publisher, holderBps, salt] });
  await a.send(factory, abi, "deploy", [0, creator, payee, publisher, holderBps, salt]);
  await a.send(feeToken, tokenAbi(), "approve", [router, 10_000_000n], { from: creator });
  await a.send(pair, tokenAbi(), "approve", [router, 1_000_000n], { from: creator });
  const params = {
    name: "Lumen", symbol: "LUMEN", logo: "", description: "", socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
    creatorFeeRecipient: router, creatorTaxBps: 300, buybackEnabled: buyback, expectedEconomics: zeroHash, salt,
  };
  const receipt = await a.send(router, claireFeeRouterAbi, "launchPons", [params, 0n, pair, 1_000_000n, 0n, [], lock], { from: creator, value: 500_000_000_000_000n });
  const token = await a.pub.readContract({ address: router, abi: claireFeeRouterAbi, functionName: "launchedToken" });
  return { router, token, receipt };
}
const noLock = { start: 0, cliff: 0, end: 0, transferable: false };
const salt = (name) => keccak256(toHex(name));

async function accrueAndHarvest(router, fee, tax) {
  const { a, pair } = world;
  const curve = await a.pub.readContract({ address: router, abi: claireFeeRouterAbi, functionName: "curve" });
  await a.send(pair, tokenAbi(), "mint", [curve, fee + tax]);
  await a.send(curve, mock("MockPonsCurve").abi, "accrueToken", [fee, tax]);
  return a.send(router, claireFeeRouterAbi, "harvest", [pair], { from: world.keeper });
}

// ------------------------------------------------------------------ launches

test("launches: a locked opening buy, a plain launch, a Stockereum launch and a forged router", async () => {
  const { a, creator, routerFactory, tokenLock, pair, feeToken, vaultFactory, publisher } = world;
  const now = await a.now();
  const locked = await launch(routerFactory, 5000, salt("a"), { start: now, cliff: now + 100, end: now + 1000, transferable: false });
  const plain = await launch(routerFactory, 5000, salt("b"), noLock);
  Object.assign(world, { locked, plain });

  const result = await verifyLaunch(a.pub, { token: locked.token, routerFactory, tokenLock, vaultFactory });
  passes(result, "locked launch");
  assert.equal(result.facts.router.toLowerCase(), locked.router.toLowerCase());
  assert.equal(result.facts.launchBlock, locked.receipt.blockNumber);
  assert.equal(result.facts.payeeKind, "creator");
  assert.equal(result.facts.launch.payee.toLowerCase(), creator.toLowerCase());
  passes(await verifyLaunch(a.pub, { token: plain.token, routerFactory, tokenLock, chunk: 2n }), "plain launch, small scan chunks");
  const facts = await readLaunch(a.pub, { token: plain.token, routerFactory });
  assert.equal(facts.routerFacts.quote.toLowerCase(), pair.toLowerCase());
  assert.equal(facts.routerFacts.stockereumPoolId, zeroHash);
  assert.equal(facts.routerFacts.revenueToken, 0n);
  assert.equal((await readRouter(a.pub, plain.router)).totalRevenue, 0n);

  // A Stockereum router reports the pool the launchpad created.
  const stockSalt = salt("stock");
  const abi = claireRouterFactoryAbi;
  const [stockRouter] = await a.pub.readContract({ address: routerFactory, abi, functionName: "predict", args: [1, creator, creator, publisher, 0, stockSalt] });
  await a.send(routerFactory, abi, "deploy", [1, creator, creator, publisher, 0, stockSalt]);
  await a.send(feeToken, tokenAbi(), "approve", [stockRouter, 10_000_000n], { from: creator });
  await a.send(stockRouter, claireFeeRouterAbi, "launchStockereum", [{ name: "Stock", symbol: "STK", metadataUri: "ipfs://x", quote: pair, quoteUsdPrice: E18, priceDeadline: BigInt(now + 3600), priceSignature: "0x", feePpm: 30_000, feesToHolders: false }, 0n, false, noLock], { from: creator });
  const stockToken = await a.pub.readContract({ address: stockRouter, abi: claireFeeRouterAbi, functionName: "launchedToken" });
  const stock = await verifyLaunch(a.pub, { token: stockToken, routerFactory });
  passes(stock, "stockereum launch");
  assert.equal(stock.facts.launch.stockereumPoolId, keccak256(encodeAbiParameters([{ type: "address" }], [stockToken])));
  assert.equal(stock.facts.launch.revenueToken, null);

  // A router from an attacker's own factory launches a token; the real factory never registered it.
  const attackerFactory = await a.deploy(world.factoryArtifact, world.factoryArgs);
  const forged = await launch(attackerFactory, 0, salt("c"), noLock);
  assert.ok(failed(await verifyLaunch(a.pub, { token: forged.token, routerFactory })).includes("registered"));
  passes(await verifyLaunch(a.pub, { token: forged.token, routerFactory: attackerFactory }), "attacker factory is self-consistent");
  assert.ok(failed(await verifyLaunch(a.pub, { token: locked.token, routerFactory, tokenLock: creator })).includes("token-lock"));
  assert.ok(failed(await verifyLaunch(a.pub, { token: locked.token, routerFactory, fromBlock: locked.receipt.blockNumber })).includes("router-deployed"), "the factory's RouterDeployed event is out of range");
  assert.equal((await verifyLaunch(a.pub, { token: locked.token, routerFactory: creator })).ok, false, "an address that is not a factory fails instead of throwing");
});

test("verifyRouterSplit recomputes every distribution and ties revenue to totalRevenue", async () => {
  const { a, plain, creator } = world;
  await accrueAndHarvest(plain.router, 1_000_000n, 500_000n);
  const first = (await a.pub.getBlock()).number;
  const result = await verifyRouterSplit(a.pub, { router: plain.router, chunk: 3n });
  passes(result, "router split");
  assert.equal(result.facts.distributions, 1);
  assert.equal(result.facts.payee.toLowerCase(), creator.toLowerCase());
  assert.equal(result.facts.totalRevenue.get(world.pair), 1_200_000n);
  // A scan that starts later can only be a lower bound, and a non-router fails cleanly.
  passes(await verifyRouterSplit(a.pub, { router: plain.router, fromBlock: first + 1n }), "partial range");
  assert.equal((await verifyRouterSplit(a.pub, { router: world.creator })).ok, false);
});

// ------------------------------------------------------------------ buyback, launch-token revenue and the proof view

test("buyback toggles, launch-token revenue splits with Claire's 10% and the proof view reports it", async () => {
  const { a, creator, deployer, keeper, locker, routerFactory, buybackVault, locked, plain, proofView, tokenLock } = world;
  const bb = await launch(routerFactory, 0, salt("bb"), noLock, { buyback: true });
  Object.assign(world, { bb });
  assert.equal((await readProof(a.pub, { proofView, token: bb.token })).buyback, true, "enabled at launch");
  assert.equal((await readProof(a.pub, { proofView, token: plain.token })).buyback, false);
  await a.send(plain.router, claireFeeRouterAbi, "setBuyback", [true], { from: creator });
  assert.equal((await readProof(a.pub, { proofView, token: plain.token })).buyback, true, "enabled after launch");
  await a.send(plain.router, claireFeeRouterAbi, "setBuyback", [false], { from: creator });
  assert.equal((await readProof(a.pub, { proofView, token: plain.token })).buyback, false);

  // The launchpad's buyback vault vests launch tokens to the router; harvesting the token counts them as revenue.
  const amount = 400n * E18;
  await a.send(bb.token, tokenAbi(), "mint", [deployer, amount]);
  await a.send(bb.token, tokenAbi(), "approve", [buybackVault, amount]);
  await a.send(buybackVault, mock("MockPonsBuybackVault").abi, "deposit", [bb.token, bb.router, amount]);
  await a.send(bb.router, claireFeeRouterAbi, "harvest", [bb.token], { from: keeper });
  const split = await verifyRouterSplit(a.pub, { router: bb.router });
  passes(split, "launch-token revenue");
  assert.equal(split.facts.revenue.get(bb.token), amount);
  assert.equal(split.facts.totalRevenue.get(bb.token), amount);
  const claireShare = amount / 10n;
  assert.equal(await a.pub.readContract({ address: bb.token, abi: tokenAbi(), functionName: "balanceOf", args: [world.treasury] }), claireShare - claireShare / 2n, "Claire's treasury half");
  assert.equal(await a.pub.readContract({ address: bb.token, abi: tokenAbi(), functionName: "balanceOf", args: [world.claireHolders] }), claireShare / 2n, "Claire's holder half");
  // A quote harvest alongside keeps both assets counted.
  await accrueAndHarvest(bb.router, 100_000n, 0n);
  const both = await verifyRouterSplit(a.pub, { router: bb.router, chunk: 5n });
  passes(both, "both assets");
  assert.equal(both.facts.distributions, 2);
  assert.equal(both.facts.totalRevenue.get(world.pair), 70_000n);

  // The router's totalRevenue for the launch token cannot be inflated past what its events charged.
  const slot = slotOf(bb.token, 12);
  await a.admin.setStorageAt({ address: bb.router, index: slot, value: word(amount + 1n) });
  assert.ok(failed(await verifyRouterSplit(a.pub, { router: bb.router })).includes("total-revenue"));
  await a.admin.setStorageAt({ address: bb.router, index: slot, value: word(amount) });
  passes(await verifyRouterSplit(a.pub, { router: bb.router }), "restored");

  await a.send(bb.token, tokenAbi(), "mint", [locker, 7n]);
  const proof = await readProof(a.pub, { proofView, token: bb.token });
  assert.equal(proof.claireLaunched, true);
  assert.equal(proof.launchpad, "pons");
  assert.equal(proof.router.toLowerCase(), bb.router.toLowerCase());
  assert.equal(proof.payee.toLowerCase(), creator.toLowerCase());
  assert.equal(proof.revenueToken, amount);
  assert.equal(proof.revenueQuote, 70_000n);
  assert.equal(proof.ponsLockedSupply, 7n);
  const lockedProof = await readProof(a.pub, { proofView, token: locked.token });
  assert.equal(lockedProof.lockedInTokenLock, 1000n * E18, "the opening buy is locked");
  assert.equal(lockedProof.holderBps, 5000);
  assert.equal(lockedProof.revenueQuote, 0n);
  const plainProof = await readProof(a.pub, { proofView, token: plain.token });
  assert.equal(plainProof.revenueQuote, (await readRouter(a.pub, plain.router)).totalRevenue);
  const stranger = await readProof(a.pub, { proofView, token: tokenLock });
  assert.equal(stranger.claireLaunched, false, "a token Claire did not launch");
  assert.equal(stranger.launchpad, null);
});

// ------------------------------------------------------------------ payees: vesting vault and split

test("verifyVestingVault: genuine via the vault factory, vested and released math over time, tampered storage", async () => {
  const { a, holderA, vaultFactory, routerFactory, keeper, pair } = world;
  const now = await a.now();
  const [start, cliff, end] = [now, now + 1000, now + 10_000];
  const vaultSalt = salt("vault");
  const vault = await a.pub.readContract({ address: vaultFactory, abi: claireVaultFactoryAbi, functionName: "predictVault", args: [holderA, start, cliff, end, vaultSalt] });
  await a.send(vaultFactory, claireVaultFactoryAbi, "deployVault", [holderA, start, cliff, end, vaultSalt]);
  const vested = await launch(routerFactory, 0, salt("vested"), noLock, { payee: vault });
  Object.assign(world, { vested, vault });
  const assets = [pair, zeroAddress];
  const check = (extra = {}) => verifyVestingVault(a.pub, { vault, vaultFactory, assets, ...extra });

  const launched = await verifyLaunch(a.pub, { token: vested.token, routerFactory, vaultFactory });
  passes(launched, "router with a vault payee");
  assert.equal(launched.facts.payeeKind, "vault");
  await accrueAndHarvest(vested.router, 1_000_000n, 0n);
  await a.wallet.sendTransaction({ account: world.deployer, chain: null, to: vault, value: 10n ** 16n });
  assert.equal((await verifyRouterSplit(a.pub, { router: vested.router })).facts.payee.toLowerCase(), vault.toLowerCase());

  let result = await check();
  passes(result, "before the cliff");
  assert.equal(result.facts.read.assets[0].vested, 0n);
  assert.equal(result.facts.read.assets[0].totalReceived, 630_000n, "the vault received the creator share");
  await a.warp(5000);
  result = await check();
  passes(result, "mid vesting");
  const [mid] = result.facts.read.assets;
  assert.ok(mid.vested > 0n && mid.vested < mid.totalReceived && mid.releasable === mid.vested);
  await a.send(vault, claireVestingVaultAbi, "release", [pair], { from: keeper });
  await a.send(vault, claireVestingVaultAbi, "release", [zeroAddress], { from: keeper });
  result = await check({ chunk: 7n });
  passes(result, "after a release");
  assert.ok(result.facts.read.assets[0].released >= mid.vested);
  await a.warp(20_000);
  await a.send(vault, claireVestingVaultAbi, "release", [pair], { from: keeper });
  result = await check();
  passes(result, "after the end");
  assert.equal(result.facts.read.assets[0].released, 630_000n);
  assert.equal((await readVestingVault(a.pub, { vault, assets })).beneficiary.toLowerCase(), holderA.toLowerCase());

  // Forged: a vault the factory never deployed, a vault under another factory, an out-of-range scan, and a non-vault.
  const direct = await a.deploy(real("ClaireVestingVault", claireVestingVaultAbi), [holderA, start, cliff, end]);
  assert.ok(failed(await verifyVestingVault(a.pub, { vault: direct, vaultFactory, assets })).includes("genuine"));
  const otherFactory = await a.deploy(real("ClaireVaultFactory", claireVaultFactoryAbi));
  assert.ok(failed(await check({})).length === 0 && failed(await verifyVestingVault(a.pub, { vault, vaultFactory: otherFactory, assets })).includes("genuine"));
  assert.ok(failed(await check({ fromBlock: (await a.pub.getBlockNumber()) })).includes("genuine"));
  assert.equal((await verifyVestingVault(a.pub, { vault: holderA, vaultFactory, assets })).ok, false);

  // Tampered: a released counter beyond what vested.
  const slot = slotOf(pair, 1);
  await a.admin.setStorageAt({ address: vault, index: slot, value: word(2_000_000n) });
  const bad = failed(await check());
  assert.ok(bad.includes(`released:${pair}`), bad.join());
  await a.admin.setStorageAt({ address: vault, index: slot, value: word(630_000n) });
  passes(await check(), "restored");
});

test("verifySplit: genuine via the vault factory, shares and paid amounts, tampered storage", async () => {
  const { a, holderA, holderB, holderC, vaultFactory, routerFactory, keeper, pair } = world;
  const payees = [holderA, holderB, holderC];
  const bps = [5000, 3000, 2000];
  const splitSalt = salt("split");
  const split = await a.pub.readContract({ address: vaultFactory, abi: claireVaultFactoryAbi, functionName: "predictSplit", args: [payees, bps, splitSalt] });
  await a.send(vaultFactory, claireVaultFactoryAbi, "deploySplit", [payees, bps, splitSalt]);
  const shared = await launch(routerFactory, 0, salt("shared"), noLock, { payee: split });
  Object.assign(world, { shared, split });
  const assets = [pair, zeroAddress];
  const check = (extra = {}) => verifySplit(a.pub, { split, vaultFactory, assets, ...extra });

  assert.equal((await verifyLaunch(a.pub, { token: shared.token, routerFactory, vaultFactory })).facts.payeeKind, "split");
  await accrueAndHarvest(shared.router, 1_000_001n, 0n);
  await a.wallet.sendTransaction({ account: world.deployer, chain: null, to: split, value: 10n ** 16n + 3n });
  let result = await check();
  passes(result, "before any release");
  const [before] = result.facts.read.assets;
  assert.equal(before.totalPaid, 0n);
  assert.deepEqual(before.releasable, [before.totalReceived * 5000n / 10_000n, before.totalReceived * 3000n / 10_000n, before.totalReceived * 2000n / 10_000n]);
  await a.send(split, claireSplitAbi, "release", [pair], { from: keeper });
  await a.send(split, claireSplitAbi, "release", [zeroAddress], { from: keeper });
  result = await check({ chunk: 5n });
  passes(result, "after releases");
  assert.ok(result.facts.read.assets[0].totalPaid > 0n && result.facts.read.assets[0].releasable.every((value) => value <= 1n), "only rounding dust is left");
  // More funds arrive: only the increase is releasable.
  await accrueAndHarvest(shared.router, 500_000n, 0n);
  passes(await check(), "after more revenue");
  assert.equal((await readSplit(a.pub, { split, assets })).payees.length, 3);

  const direct = await a.deploy(real("ClaireSplit", claireSplitAbi), [payees, bps]);
  assert.ok(failed(await verifySplit(a.pub, { split: direct, vaultFactory, assets })).includes("genuine"));
  assert.ok(failed(await check({ fromBlock: await a.pub.getBlockNumber() })).includes("genuine"));
  assert.equal((await verifySplit(a.pub, { split: holderA, vaultFactory, assets })).ok, false);

  // Tampered: the total paid no longer equals what the payees were paid.
  const slot = slotOf(pair, 3);
  const [paidNow] = (await readSplit(a.pub, { split, assets })).assets.map((x) => x.totalPaid);
  await a.admin.setStorageAt({ address: split, index: slot, value: word(paidNow + 5n) });
  assert.ok(failed(await check()).includes(`paid:${pair}`));
  await a.admin.setStorageAt({ address: split, index: slot, value: word(paidNow) });
  passes(await check(), "restored");
});

// ------------------------------------------------------------------ locks

test("verifyLock: opening-buy lock, creator lock, vesting over time, notice-period cancel and a missed creation event", async () => {
  const { a, creator, routerFactory, tokenLock, locked, plain } = world;
  const opening = await verifyLock(a.pub, { tokenLock, lockId: 0n, routerFactory });
  passes(opening, "opening-buy lock");
  assert.equal(opening.facts.openingBuy, true);
  assert.equal(opening.facts.cancelState, "not-cancelable");
  assert.equal(opening.facts.read.lock.cancelable, false);
  assert.equal(opening.facts.read.lock.cancelNotice, 0);
  assert.equal(opening.facts.read.lock.amount, 1000n * E18);

  await a.warp(500);
  const vesting = await verifyLock(a.pub, { tokenLock, lockId: 0n, routerFactory });
  passes(vesting, "vesting after 500s");
  assert.ok(vesting.facts.read.vested > 0n);
  assert.equal((await readLock(a.pub, { tokenLock, lockId: 0n })).lock.funder.toLowerCase(), locked.router.toLowerCase());

  await a.send(plain.token, tokenAbi(), "approve", [tokenLock, 300n * E18], { from: creator });
  const ts = await a.now();
  const schedule = { start: ts, cliff: ts + 50, end: ts + 5000, cancelable: true, transferable: true, cancelNotice: 0 };
  const receipt = await a.send(tokenLock, claireTokenLockAbi, "createLocks", [plain.token, schedule, [{ beneficiary: world.holderA, amount: 100n * E18 }]], { from: creator });
  const own = await verifyLock(a.pub, { tokenLock, lockId: 1n, routerFactory });
  passes(own, "creator-funded lock");
  assert.equal(own.facts.openingBuy, false);
  assert.equal(own.facts.cancelState, "cancelable");
  assert.ok(failed(await verifyLock(a.pub, { tokenLock, lockId: 1n, fromBlock: receipt.blockNumber + 1n })).includes("creation-event"));
  assert.equal((await verifyLock(a.pub, { tokenLock, lockId: 9n })).ok, false, "an unknown lock fails instead of throwing");

  // Notice-period cancel: not requested, pending, open, canceled.
  await a.send(tokenLock, claireTokenLockAbi, "createLocks", [plain.token, { ...schedule, start: ts + 1, transferable: false, cancelNotice: 500 }, [{ beneficiary: world.holderB, amount: 100n * E18 }]], { from: creator });
  const noticed = (extra = {}) => verifyLock(a.pub, { tokenLock, lockId: 2n, ...extra });
  let result = await noticed();
  passes(result, "notice not requested");
  assert.equal(result.facts.cancelState, "notice-not-requested");
  await assert.rejects(a.send(tokenLock, claireTokenLockAbi, "cancel", [2n], { from: creator }), "cancel needs a request first");
  const requested = await a.send(tokenLock, claireTokenLockAbi, "requestCancel", [2n], { from: creator });
  result = await noticed();
  passes(result, "notice pending");
  assert.equal(result.facts.cancelState, "notice-pending");
  assert.ok(result.facts.read.lock.cancelAt > 0);
  await assert.rejects(a.send(tokenLock, claireTokenLockAbi, "cancel", [2n], { from: creator }), "cancel waits for the notice");
  assert.ok(failed(await noticed({ fromBlock: requested.blockNumber + 1n })).includes("cancel-events"), "a cancelAt without its CancelRequested event");
  await a.warp(600);
  result = await noticed();
  passes(result, "notice elapsed");
  assert.equal(result.facts.cancelState, "cancel-open");
  await a.send(tokenLock, claireTokenLockAbi, "cancel", [2n], { from: creator });
  result = await noticed();
  passes(result, "canceled");
  assert.equal(result.facts.cancelState, "canceled");
  assert.ok(result.facts.read.lock.amount < 100n * E18 && result.facts.read.lock.amount > 0n, "what vested at cancel stays with the beneficiary");
  assert.ok(failed(await noticed({ fromBlock: requested.blockNumber + 1n })).includes("cancel-events"));
});

test("verifyRevenueLock recomputes tranches, baseline and unlocked amounts", async () => {
  const { a, creator, plain, revenueLock } = world;
  const amount = 200n * E18;
  await a.send(plain.token, tokenAbi(), "approve", [revenueLock, amount], { from: creator });
  const deadline = (await a.now()) + 100_000;
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
  await a.warp(100_001);
  result = await verifyRevenueLock(a.pub, { revenueLock, lockId: 0n });
  passes(result, "after the deadline");
  assert.equal(result.facts.read.unlocked, amount);
});

// ------------------------------------------------------------------ price lock

test("verifyPriceLock rebuilds the sampled price history, the highWater ratchet and the unlocked amount", async () => {
  const { a, creator, keeper, plain, priceLock, routerFactory } = world;
  const curve = await a.pub.readContract({ address: plain.router, abi: claireFeeRouterAbi, functionName: "curve" });
  const setPrice = (price) => a.send(curve, mock("MockPonsCurve").abi, "setReserves", [price, E18]);
  // Explicit gas: anvil estimates at the pre-warp timestamp, where a poke takes a cheaper path (hour roll-over, window scan) than when it is mined.
  const poke = () => a.wallet.writeContract({ address: priceLock, abi: clairePriceLockAbi, functionName: "poke", args: [plain.token], account: keeper, chain: null, gas: 3_000_000n }).then((hash) => a.pub.waitForTransactionReceipt({ hash })).then((receipt) => assert.equal(receipt.status, "success", "poke"));
  /** One sample per half hour, so every hour holds samples. */
  const pokes = async (count) => { for (let i = 0; i < count; i++) { await a.admin.increaseTime({ seconds: 1800 }); await poke(); } };
  await setPrice(1000n);
  const amount = 100n * E18;
  await a.send(plain.token, tokenAbi(), "approve", [priceLock, amount], { from: creator });
  const deadline = (await a.now()) + 10 * 86_400;
  const created = await a.send(priceLock, clairePriceLockAbi, "createLocks", [plain.token, [{ price: 800n, bps: 4000 }, { price: 2000n, bps: 6000 }], deadline, [{ beneficiary: world.holderA, amount }]], { from: creator });
  const check = (extra = {}) => verifyPriceLock(a.pub, { priceLock, lockId: 0n, routerFactory, ...extra });

  let result = await check();
  passes(result, "fresh price lock");
  assert.equal(result.facts.read.unlocked, 0n);
  assert.equal(result.facts.samples, 0);
  assert.equal((await readPriceLock(a.pub, { priceLock, lockId: 0n })).tranches.length, 2);

  // 26 hours of samples with one honest dip: the window minimum is the dip while it is inside the window, so nothing unlocks.
  await pokes(10);
  await setPrice(700n);
  await pokes(1);
  await setPrice(1000n);
  await pokes(41);
  result = await check({ chunk: 50n });
  passes(result, "inside the dip's window");
  assert.equal(result.facts.samples, 52);
  assert.ok(result.facts.read.highWater <= 700n && result.facts.read.unlocked === 0n, "a dip below the first tranche keeps it locked");

  // The dip rolls out of the window: highWater ratchets to the new window minimum and the first tranche unlocks for good.
  await pokes(60);
  result = await check();
  passes(result, "after the dip rolled out");
  assert.equal(result.facts.read.highWater, 1000n);
  assert.equal(result.facts.expectedHighWater, 1000n);
  assert.equal(result.facts.read.windowMin, 1000n);
  assert.equal(result.facts.read.unlocked, amount * 4000n / 10_000n);
  await a.send(priceLock, clairePriceLockAbi, "claim", [0n], { from: keeper });
  result = await check();
  passes(result, "after a claim");
  assert.equal(result.facts.read.lock.claimed, amount * 4000n / 10_000n);
  // A price drop does not relock what the ratchet unlocked.
  await setPrice(100n);
  await pokes(3);
  result = await check();
  passes(result, "after a drop");
  assert.equal(result.facts.read.unlocked, amount * 4000n / 10_000n);

  // Forged and tampered: the wrong registry, a partial scan, a corrupted highWater, an unknown lock and a non-lock.
  assert.ok(failed(await check({ routerFactory: creator })).includes("claire-launched"));
  const partial = failed(await check({ fromBlock: created.blockNumber + 1n }));
  assert.ok(partial.includes("high-water") && partial.includes("creation-event"), partial.join());
  const slot = slotOf(plain.token, 4);
  await a.admin.setStorageAt({ address: priceLock, index: slot, value: word(2500n) });
  assert.ok(failed(await check()).includes("high-water"), "a highWater no sample supports");
  await a.admin.setStorageAt({ address: priceLock, index: slot, value: word(1000n) });
  passes(await check(), "restored");
  assert.equal((await verifyPriceLock(a.pub, { priceLock, lockId: 99n })).ok, false);
  assert.equal((await verifyPriceLock(a.pub, { priceLock: creator, lockId: 0n })).ok, false);

  // The deadline releases everything regardless of price.
  await a.warp(11 * 86_400);
  result = await check();
  passes(result, "after the deadline");
  assert.equal(result.facts.read.unlocked, amount);
});

// ------------------------------------------------------------------ rounds

async function setupSnapshot(chain) {
  const { deployer, holderA, holderB, holderC, holderD } = world;
  const token = mock("LocalClaireToken");
  const address = await chain.deploy(token, [deployer, 1_000_000n * E18]);
  for (const [to, amount] of [[holderA, 600_000n * E18 + 7n], [holderB, 300_000n * E18 + 3n], [holderC, 70_001n * E18], [holderD, 1n]]) await chain.send(address, token.abi, "transfer", [to, amount]);
  const block = await chain.pub.getBlockNumber({ cacheTime: 0 });
  // Movements after the snapshot must not affect it.
  await chain.send(address, token.abi, "transfer", [world.keeper, 1000n * E18], { from: holderA });
  const balances = [];
  for (const account of [holderA, holderB, holderC, holderD]) balances.push([account, await chain.pub.readContract({ address, abi: token.abi, functionName: "balanceOf", args: [account], blockNumber: block })]);
  return { address, block, balances };
}

/** Everything published per asset: the leaves' cumulative amounts (as the manifest says) and the manifest, for the next round to chain to. */
const published = new Map();
const store = new Map(); // evidence -> manifest text, what the manifest server serves

/**
 * Publishes the next cumulative root of `asset` from funds the distributor holds. Pro-rata rounds split what is unreserved over `snapshot.balances`;
 * accounts of earlier rounds that are not in this one carry their cumulative with amount 0 and no balance.
 * Options tamper with the manifest: `drop` omits a holder, `lie` misreports a balance, `inflate` overstates distributable, `shift` moves cumulative from the first to the second account, `vanish` removes an account and gives its cumulative to another, `wrongPrevious` names another previous root.
 */
async function publish(snapshot, { asset = world.pair, drop = [], lie = false, inflate = 1n, shift = false, vanish = null, wrongPrevious = false, purpose = "claire-holders", rewards = null } = {}) {
  const { a, clairePublisher: publisher, claireHolders } = world;
  const prev = published.get(asset) ?? { cum: new Map(), evidence: null, text: undefined, roundId: null };
  const roundId = await a.pub.readContract({ address: claireHolders, abi: claireDistributorAbi, functionName: "roundCount" });
  const amounts = new Map();
  let rule, balanceOf = new Map(), available = 0n;
  if (rewards) {
    for (const [account, amount] of rewards) amounts.set(lower(account), (amounts.get(lower(account)) ?? 0n) + BigInt(amount));
    await a.send(asset, tokenAbi(), "mint", [claireHolders, [...amounts.values()].reduce((x, y) => x + y, 0n)]);
    rule = { type: "referral-rewards", rewards: rewards.map(([account, amount, ids]) => [lower(account), String(amount), ids]) };
  } else {
    await a.send(asset, tokenAbi(), "mint", [claireHolders, 1_000_001n]);
    available = await a.pub.readContract({ address: claireHolders, abi: claireDistributorAbi, functionName: "unreserved", args: [asset] });
    const listed = snapshot.balances.filter(([account]) => !drop.includes(account));
    const held = listed.reduce((sum, [, balance]) => sum + balance, 0n);
    for (const [account, balance] of listed) { amounts.set(lower(account), available * balance / held); balanceOf.set(lower(account), balance); }
    rule = { type: "pro-rata", distributable: String(available * inflate), eligibleBalance: String(held), excluded: [lower(world.deployer)], minBalance: null };
  }
  const cum = new Map(prev.cum);
  for (const [account, amount] of amounts) cum.set(account, (cum.get(account) ?? 0n) + amount);
  let leaves = [...cum].filter(([, value]) => value > 0n).sort(([x], [y]) => (x < y ? -1 : 1)).map(([account, value]) => ({
    account, amount: String(amounts.get(account) ?? 0n), cumulative: String(value), balance: balanceOf.has(account) ? String(balanceOf.get(account)) : null,
  }));
  if (shift) { leaves[0].cumulative = String(BigInt(leaves[0].cumulative) - 5n); leaves[1].cumulative = String(BigInt(leaves[1].cumulative) + 5n); }
  if (vanish) {
    const gone = leaves.find((leaf) => leaf.account === lower(vanish));
    leaves = leaves.filter((leaf) => leaf !== gone);
    leaves[0].cumulative = String(BigInt(leaves[0].cumulative) + BigInt(gone.cumulative));
  }
  if (lie) { const target = leaves.find((leaf) => leaf.balance !== null); target.balance = String(BigInt(target.balance) + 1n); }
  const total = [...amounts.values()].reduce((x, y) => x + y, 0n);
  const previousTotal = [...prev.cum.values()].reduce((x, y) => x + y, 0n);
  const text = JSON.stringify({
    kind: "claire-round", version: 1, purpose, chainId: a.chainId, distributor: lower(claireHolders), asset: lower(asset),
    previousEvidence: wrongPrevious ? keccak256(toHex("not the previous root")) : prev.evidence, total: String(total), cumulativeTotal: String(previousTotal + total),
    snapshot: snapshot ? { chainId: snapshot.chain.chainId, block: String(snapshot.block), token: lower(snapshot.address) } : { chainId: a.chainId, block: "1", token: null },
    rule, leaves,
  });
  const hashes = leaves.map((leaf) => roundLeafHash(a.chainId, claireHolders, asset, leaf));
  const evidence = manifestEvidence(text);
  await a.send(claireHolders, claireDistributorAbi, "publish", [asset, previousTotal + total, merkleRoot(hashes), snapshot ? snapshot.block : 1n, evidence], { from: publisher });
  published.set(asset, { cum: new Map(leaves.map((leaf) => [leaf.account, BigInt(leaf.cumulative)])), evidence, text, roundId });
  store.set(evidence, text);
  return { roundId, text, leaves, hashes, available, total, previousText: prev.text, asset };
}
const verify = (round, extra = {}) => verifyRound(world.a.pub, { distributor: world.claireHolders, roundId: round.roundId, manifest: round.text, ...(round.previousText === undefined ? {} : { previousManifest: round.previousText }), ...extra });

test("verifyRound: honest cumulative rounds pass every level, same chain and cross chain, and the SDK's proofs claim", async () => {
  const { a, b, claireHolders, keeper, pair } = world;
  const sameChain = { chain: a, ...await setupSnapshot(a) };
  const crossChain = { chain: b, ...await setupSnapshot(b) };
  Object.assign(world, { sameChain, crossChain });

  const first = await publish(sameChain);
  assert.equal(first.leaves.length, 3, "the 1 wei holder rounds to zero and gets no leaf");
  assert.equal(first.leaves.every((leaf) => leaf.amount === leaf.cumulative), true, "the first round's cumulative is its amount");
  for (const level of ["manifest", "balances", "complete"]) passes(await verify(first, { level, chunk: 4n }), `first round ${level}`);

  // The SDK's leaf hashes and proofs are exactly what the deployed distributor accepts, and a claim pays cumulative minus claimed.
  const claimant = first.leaves[1];
  const claim = async (round, leaf, index) => a.send(claireHolders, claireDistributorAbi, "claim", [pair, leaf.account, BigInt(leaf.cumulative), merkleProof(round.hashes, index)], { from: keeper });
  const balanceOf = (account) => a.pub.readContract({ address: pair, abi: tokenAbi(), functionName: "balanceOf", args: [account] });
  let before = await balanceOf(claimant.account);
  await claim(first, claimant, 1);
  assert.equal(await balanceOf(claimant.account), before + BigInt(claimant.amount));
  passes(await verify(first, { level: "complete" }), "latest root after a claim");
  assert.equal((await readRound(a.pub, { distributor: claireHolders, roundId: first.roundId })).round.evidence, manifestEvidence(first.text));

  // Second round: another chain's snapshot, chained to the first; accounts keep what they were promised.
  const second = await publish(crossChain);
  const secondLeaf = second.leaves.find((leaf) => leaf.account === claimant.account);
  assert.equal(BigInt(secondLeaf.cumulative), BigInt(claimant.cumulative) + BigInt(secondLeaf.amount));
  passes(await verify(second), "cross chain manifest");
  const noClient = await verify(second, { level: "balances" });
  assert.ok(failed(noClient).includes("snapshot-chain"), "a snapshot on another chain needs that chain's client");
  const complete = await verify(second, { level: "complete", snapshotClient: b.pub });
  passes(complete, "cross chain complete");
  assert.equal(complete.facts.eligible, 4);
  assert.equal(complete.facts.previousRoundId, first.roundId);
  before = await balanceOf(claimant.account);
  await claim(second, secondLeaf, second.leaves.indexOf(secondLeaf));
  assert.equal(await balanceOf(claimant.account), before + BigInt(secondLeaf.amount), "a claim after a new round pays only the increase");
  passes(await verify(second, { level: "manifest" }), "latest root after the second claim");
  // The older round's manifest still verifies on its own (it is no longer the claimable root).
  passes(await verify(first, { level: "complete" }), "first round once superseded");
});

test("verifyRound: tampered, incomplete, misreported and mis-chained manifests fail", async () => {
  const { a, claireHolders, sameChain } = world;
  const honest = await publish(sameChain);
  passes(await verify(honest, { level: "complete" }), "honest control");

  // Any change to the served text breaks the evidence hash, and a changed amount also breaks the Merkle root.
  const tampered = honest.text.replace(`"amount":"${honest.leaves[0].amount}"`, `"amount":"${BigInt(honest.leaves[0].amount) + 1n}"`);
  assert.notEqual(tampered, honest.text);
  const bad = await verify(honest, { manifest: tampered });
  assert.ok(failed(bad).includes("evidence") && failed(bad).includes("total") && failed(bad).includes("continuity"), failed(bad).join());
  assert.deepEqual(failed(await verify(honest, { manifest: `${honest.text} ` })), ["evidence"], "even whitespace changes the evidence");
  assert.ok(failed(await verify(honest, { manifest: "not json" })).includes("manifest-shape"));
  assert.ok(failed(await verify(honest, { roundId: 99n })).includes("round"));
  assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId })).includes("manifest-source"));
  // A changed cumulative changes the root even when the text is re-hashed by a lying server.
  const inflatedLeaf = JSON.parse(honest.text);
  inflatedLeaf.leaves[0].cumulative = String(BigInt(inflatedLeaf.leaves[0].cumulative) + 1n);
  assert.ok(failed(await verify(honest, { manifest: JSON.stringify(inflatedLeaf) })).includes("root"));

  // The previous manifest is required, must be the one the previous root names, and must match its on-chain total.
  assert.deepEqual(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId, manifest: honest.text })), ["previous-manifest"]);
  assert.ok(failed(await verify(honest, { previousManifest: honest.previousText.replace('"amount"', '"amount" ') })).includes("previous-manifest"));
  assert.ok(failed(await verify(honest, { previousManifest: honest.text })).includes("previous-manifest"), "the wrong manifest for the previous root");

  // A publisher who omits a holder still publishes a self-consistent manifest; only the holder scan exposes it.
  const omitted = await publish(sameChain, { drop: [world.holderC] });
  passes(await verify(omitted), "omitted holder, manifest level");
  passes(await verify(omitted, { level: "balances" }), "omitted holder, balances level");
  assert.deepEqual(failed(await verify(omitted, { level: "complete" })), ["complete"]);

  // A misreported balance is caught against the token at the snapshot block.
  const lied = await publish(sameChain, { lie: true });
  passes(await verify(lied), "misreported balance, manifest level");
  assert.ok(failed(await verify(lied, { level: "balances" })).includes("balances"));

  // A distributable total that does not reproduce the amounts is caught as soon as the balances are known.
  const inflated = await publish(sameChain, { inflate: 2n });
  assert.ok(failed(await verify(inflated, { level: "balances" })).includes("pro-rata"));

  // Cumulative continuity: moving cumulative between accounts, or making one disappear, keeps every sum right and is still caught.
  const shifted = await publish(sameChain, { shift: true });
  assert.deepEqual(failed(await verify(shifted)), ["continuity"]);
  const vanished = await publish(sameChain, { vanish: honest.leaves[0].account });
  assert.deepEqual(failed(await verify(vanished)), ["total", "continuity"], "the vanished account\u0027s amount is missing from the leaves too");

  // A manifest that names the wrong previous root.
  const unlinked = await publish(sameChain, { wrongPrevious: true });
  assert.deepEqual(failed(await verify(unlinked)), ["previous-link"]);

  // A scan that starts after the token's first transfers cannot account for its supply.
  const latest = await publish(sameChain);
  assert.ok(failed(await verify(latest, { level: "complete", fromBlock: sameChain.block })).includes("scan-supply"));

  // An account that claimed more than its cumulative (corrupt claimed counter) breaks the claim check of the latest root.
  const account = latest.leaves[0].account;
  const slot = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [account, slotOf(world.pair, 5)]));
  await a.admin.setStorageAt({ address: claireHolders, index: slot, value: word(BigInt(latest.leaves[0].cumulative) + 1n) });
  assert.ok(failed(await verify(latest)).includes("claims"));
  await a.admin.setStorageAt({ address: claireHolders, index: slot, value: word(0n) });
  passes(await verify(latest), "claimed counter restored");
});

test("verifyRound: manifests are fetched by evidence hash, and referral rounds check their rewards and carry accounts over", async () => {
  const { a, claireHolders, holderA, holderB } = world;
  const honest = await publish(world.sameChain);
  const { createServer: serve } = await import("node:http");
  const server = serve((request, response) => {
    const match = new RegExp(`^/rounds/${a.chainId}/${lower(claireHolders)}/(0x[0-9a-f]{64})\\.json$`).exec(request.url);
    const text = match && store.get(match[1]);
    response.writeHead(text ? 200 : 404, { "content-type": "application/json" }).end(text ?? "{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const manifestBaseUrl = `http://127.0.0.1:${server.address().port}/`;
    passes(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId, manifestBaseUrl }), "fetched manifest and previous manifest");
    assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId + 50n, manifestBaseUrl })).includes("round"));
    store.delete(honest.previousText && manifestEvidence(honest.previousText));
    assert.ok(failed(await verifyRound(a.pub, { distributor: claireHolders, roundId: honest.roundId, manifestBaseUrl })).includes("previous-manifest"), "the previous manifest is not served");
  } finally { server.close(); }

  // A referral asset's rounds: first root, then a second one where one account earns nothing and carries its cumulative.
  const reward = await a.deploy(mock("DecimalToken"), [6]);
  const one = await publish(null, { asset: reward, purpose: "referrals", rewards: [[holderA, "300", ["1", "2"]], [holderB, "250", ["3"]], [holderA, "150", ["4"]]] });
  assert.deepEqual(Object.fromEntries(one.leaves.map((leaf) => [leaf.account, [leaf.amount, leaf.cumulative]])), { [lower(holderA)]: ["450", "450"], [lower(holderB)]: ["250", "250"] });
  passes(await verify(one, { level: "complete" }), "first referral round");
  const two = await publish(null, { asset: reward, purpose: "referrals", rewards: [[holderA, "50", ["5"]]] });
  const carried = two.leaves.find((leaf) => leaf.account === lower(holderB));
  assert.deepEqual([carried.amount, carried.cumulative], ["0", "250"]);
  passes(await verify(two, { level: "complete" }), "second referral round");
  // A reward that no leaf accounts for is caught.
  const forged = JSON.parse(two.text);
  forged.rule.rewards.push([lower(holderB), "9", ["6"]]);
  assert.ok(failed(await verify(two, { manifest: JSON.stringify(forged) })).includes("rewards"));
});

// ------------------------------------------------------------------ adoption (path 3)

test("adopt: an existing pons token moves to a router; historical fees and vest are not revenue; forged adoptions fail", async () => {
  const { a, creator, publisher, deployer, keeper, pair, feeToken, routerFactory, ponsFactory, buybackVault, vaultFactory, plain } = world;
  const [factoryMock, curveMock, vaultMock] = [mock("MockPonsFactory").abi, mock("MockPonsCurve").abi, mock("MockPonsBuybackVault").abi];
  const balance = (token, address) => a.pub.readContract({ address: token, abi: tokenAbi(), functionName: "balanceOf", args: [address] });
  const mint = (token, to, amount) => a.send(token, tokenAbi(), "mint", [to, amount]);
  /** Launches a token straight on pons (the creator is its fee recipient) with 1_000_000 fees on its curve and a 300-token buyback vest the creator already earned, then moves it to a new router of `factory` and adopts it. */
  async function adoptThrough(factory, name, fee) {
    const abi = claireRouterFactoryAbi;
    const [router] = await a.pub.readContract({ address: factory, abi, functionName: "predict", args: [0, creator, creator, publisher, 0, salt(name)] });
    await a.send(factory, abi, "deploy", [0, creator, creator, publisher, 0, salt(name)]);
    const params = {
      name: "Old", symbol: "OLD", logo: "", description: "", socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
      creatorFeeRecipient: creator, creatorTaxBps: 300, buybackEnabled: true, expectedEconomics: zeroHash, salt: salt(name),
    };
    const launchArgs = { address: ponsFactory, abi: factoryMock, functionName: "launchToken", args: [params, 0n, pair, []], account: creator, value: 500_000_000_000_000n };
    const { result: [token, curve] } = await a.pub.simulateContract(launchArgs);
    await a.send(ponsFactory, factoryMock, "launchToken", launchArgs.args, { from: creator, value: launchArgs.value });
    await mint(pair, curve, 1_000_000n);
    await a.send(curve, curveMock, "accrueToken", [1_000_000n, 0n]);
    await mint(token, deployer, 300n * E18);
    await a.send(token, tokenAbi(), "approve", [buybackVault, 300n * E18]);
    await a.send(buybackVault, vaultMock, "deposit", [token, creator, 300n * E18]);
    await a.send(ponsFactory, factoryMock, "transferCreatorFeeRecipient", [token, router], { from: creator });
    await a.send(buybackVault, vaultMock, "deposit", [token, router, 0n]); // the vault follows the recipient
    await a.send(feeToken, tokenAbi(), "approve", [router, fee], { from: creator });
    const [pairBefore, feeBefore] = [await balance(pair, creator), await balance(feeToken, creator)];
    const receipt = await a.send(router, claireFeeRouterAbi, "adopt", [token], { from: creator });
    return { router, token, curve, receipt, pairPaid: (await balance(pair, creator)) - pairBefore, feePaid: feeBefore - (await balance(feeToken, creator)) };
  }

  const old = await adoptThrough(routerFactory, "old", 25_000_000n);
  assert.equal(old.feePaid, 25_000_000n, "the creator paid the USD 25 migration fee");
  assert.equal(old.pairPaid, 700_000n, "fees earned before the move went to the creator");
  assert.equal(await balance(pair, old.router), 0n);

  const result = await verifyLaunch(a.pub, { token: old.token, routerFactory, vaultFactory, chunk: 3n });
  passes(result, "adopted token");
  assert.equal(result.facts.path, "migrated");
  assert.equal(result.facts.launchBlock, old.receipt.blockNumber);
  assert.equal(result.facts.launch.migrationFee, 25_000_000n);
  assert.equal(result.facts.launch.historicalVest, 300n * E18);
  assert.equal(result.facts.launch.quote.toLowerCase(), pair.toLowerCase());
  assert.equal(result.checks.find((check) => check.id === "migration-fee").ok, true);
  assert.equal((await verifyLaunch(a.pub, { token: plain.token, routerFactory })).facts.path, "launched");
  assert.equal((await readLaunch(a.pub, { token: old.token, routerFactory })).claireLaunched, true);

  // Right after adoption nothing is revenue; the earlier fees are historical.
  let split = await verifyRouterSplit(a.pub, { router: old.router });
  passes(split, "after adoption");
  assert.equal(split.facts.distributions, 0);
  assert.equal(split.facts.historical.get(pair), 700_000n);
  assert.equal(split.facts.revenue.get(pair), 0n);
  assert.equal(split.facts.totalRevenue.get(pair), 0n);

  // Fees earned after adoption are revenue (Claire's 10%); the vest the creator already earned is paid to the creator uncharged, only later buybacks are revenue.
  await accrueAndHarvest(old.router, 1_000_000n, 0n);
  await mint(old.token, deployer, 100n * E18);
  await a.send(old.token, tokenAbi(), "approve", [buybackVault, 100n * E18]);
  await a.send(buybackVault, vaultMock, "deposit", [old.token, old.router, 100n * E18]);
  assert.equal((await readRouter(a.pub, old.router)).historicalVest, 300n * E18);
  await a.send(old.router, claireFeeRouterAbi, "harvest", [old.token], { from: keeper });
  assert.equal((await readRouter(a.pub, old.router)).historicalVest, 0n);
  assert.equal(await balance(old.token, creator), 300n * E18 + 90n * E18, "the old vest plus the creator's share of the new buyback");
  split = await verifyRouterSplit(a.pub, { router: old.router, chunk: 4n });
  passes(split, "after revenue");
  assert.equal(split.facts.distributions, 2);
  assert.equal(split.facts.historical.get(pair), 700_000n);
  assert.equal(split.facts.historical.get(old.token), 300n * E18);
  assert.equal(split.facts.revenue.get(pair), 700_000n);
  assert.equal(split.facts.revenue.get(old.token), 100n * E18);
  assert.equal(split.facts.totalRevenue.get(old.token), 100n * E18);
  passes(await verifyLaunch(a.pub, { token: old.token, routerFactory }), "adopted token with revenue");

  // A router that counted the historical vest as revenue is caught.
  const slot = slotOf(old.token, 12);
  await a.admin.setStorageAt({ address: old.router, index: slot, value: word(400n * E18) });
  assert.ok(failed(await verifyRouterSplit(a.pub, { router: old.router })).includes("total-revenue"));
  await a.admin.setStorageAt({ address: old.router, index: slot, value: word(100n * E18) });
  passes(await verifyRouterSplit(a.pub, { router: old.router }), "restored");

  // Forged: an attacker's factory (here with no migration fee) adopts a token. The real factory never registered it; against its own factory it is self-consistent but reports no fee.
  const attackerFactory = await a.deploy(world.factoryArtifact, world.factoryArgs.map((value, i) => i === 5 ? 0n : value));
  const forged = await adoptThrough(attackerFactory, "forged", 0n);
  assert.ok(failed(await verifyLaunch(a.pub, { token: forged.token, routerFactory })).includes("registered"));
  const own = await verifyLaunch(a.pub, { token: forged.token, routerFactory: attackerFactory });
  passes(own, "attacker factory is self-consistent");
  assert.equal(own.facts.launch.migrationFee, 0n);
  assert.notEqual(own.facts.launch.migrationFee, result.facts.launch.migrationFee, "the real router's migration fee differs from the forged one's");
  // An out-of-range scan that misses the Adopted event, and a factory that never registered the token.
  assert.ok(failed(await verifyLaunch(a.pub, { token: old.token, routerFactory, fromBlock: old.receipt.blockNumber + 1n })).includes("launch-event"));
  assert.ok(failed(await verifyLaunch(a.pub, { token: old.token, routerFactory: attackerFactory })).includes("registered"), "the real adopted token is unknown to the attacker's factory");
});

// ------------------------------------------------------------------ changeable split

test("changeable split: raise the holder share, propose, cancel and apply a payee, and forged changes fail", async () => {
  const { a, creator, keeper, holderA, holderC, routerFactory, routerDeployer, proofView, vaultFactory, tokenLock, pair } = world;
  const call = (router, functionName, args = [], from = creator) => a.send(router, claireFeeRouterAbi, functionName, args, { from });
  const reverts = (router, functionName, args, from) => assert.rejects(a.pub.simulateContract({ address: router, abi: claireFeeRouterAbi, functionName, args, account: from }), functionName);
  const { router, token } = await launch(routerFactory, 2000, salt("split"), noLock);
  const verify = (extra = {}) => verifyLaunch(a.pub, { token, routerFactory, routerDeployer, vaultFactory, tokenLock, ...extra });

  // A distribution under the 20% share, a raise (instant, creator only, never lower), then one under 40%.
  await accrueAndHarvest(router, 1_000_000n, 0n);
  await reverts(router, "raiseHolderShare", [4000], keeper);
  await reverts(router, "raiseHolderShare", [2000], creator);
  await reverts(router, "raiseHolderShare", [1000], creator);
  await call(router, "raiseHolderShare", [4000]);
  let result = await verify();
  passes(result, "after a raise");
  assert.deepEqual(result.facts.initial, { payee: getAddress(creator), holderBps: 2000 });
  assert.deepEqual(result.facts.holderShareRaises.map(({ oldBps, newBps }) => [oldBps, newBps]), [[2000, 4000]]);
  assert.equal(result.facts.launch.holderBps, 4000);
  assert.equal((await readProof(a.pub, { proofView, token })).holderBps, 4000);
  await accrueAndHarvest(router, 1_000_000n, 0n);
  let split = await verifyRouterSplit(a.pub, { router, chunk: 5n });
  passes(split, "each distribution at the share in effect");
  assert.equal(split.facts.distributions, 2);
  assert.deepEqual(split.facts.holderShareRaises.map(({ newBps }) => newBps), [4000]);
  passes(await verifyRouterSplit(a.pub, { router, fromBlock: split.facts.holderShareRaises[0].blockNumber + 1n }), "range after the raise");
  assert.ok(failed(await verify({ routerDeployer: creator })).includes("router-address"), "a deployer the factory does not use");

  // Propose, early apply fails, cancel, propose again and apply after the notice.
  await reverts(router, "proposePayee", [holderA], keeper);
  await reverts(router, "proposePayee", [creator], creator);
  await call(router, "proposePayee", [holderA]);
  const proposedAt = BigInt(await a.now());
  let facts = await readRouter(a.pub, router);
  assert.equal(facts.pendingPayee, getAddress(holderA));
  assert.equal(facts.payeeChangeAt, proposedAt + 7n * 86_400n);
  const proof = await readProof(a.pub, { proofView, token });
  assert.deepEqual([proof.pendingPayee, proof.payeeChangeAt, proof.payee], [getAddress(holderA), facts.payeeChangeAt, getAddress(creator)]);
  passes(await verify(), "a proposal is pending");
  await a.warp(7 * 86_400 - 100);
  await reverts(router, "applyPayee", [], keeper);
  await call(router, "cancelPayee");
  facts = await readRouter(a.pub, router);
  assert.deepEqual([facts.pendingPayee, facts.payeeChangeAt], [zeroAddress, 0n]);
  passes(await verify(), "canceled");
  await call(router, "proposePayee", [holderA]);
  await a.warp(7 * 86_400 + 1);
  await call(router, "applyPayee", [], keeper);
  result = await verify();
  passes(result, "payee changed");
  assert.equal(result.facts.launch.payee, getAddress(holderA));
  assert.equal(result.facts.payeeKind, "other");
  assert.deepEqual(result.facts.payeeChanges.map(({ oldPayee, newPayee }) => [oldPayee, newPayee]), [[getAddress(creator), getAddress(holderA)]]);
  assert.equal(result.facts.holderShareRaises.length, 1, "the earlier raise is still reported");
  const before = await a.pub.readContract({ address: pair, abi: tokenAbi(), functionName: "balanceOf", args: [holderA] });
  await accrueAndHarvest(router, 1_000_000n, 0n);
  assert.ok(await a.pub.readContract({ address: pair, abi: tokenAbi(), functionName: "balanceOf", args: [holderA] }) > before, "the new payee is paid");
  split = await verifyRouterSplit(a.pub, { router });
  passes(split, "after the payee change");
  assert.deepEqual(split.facts.payees, [getAddress(creator), getAddress(creator), getAddress(holderA)]);
  assert.equal(split.facts.payee, getAddress(holderA));

  // Forged: the payee or holder share differs without an event, or a pending payee exists without a proposal. Slot 1 packs the payee (low 20 bytes) and holderBps; slot 2 the pending payee and payeeChangeAt.
  const forge = async (index, value, what, splitToo) => {
    const original = await a.pub.getStorageAt({ address: router, slot: index });
    await a.admin.setStorageAt({ address: router, index, value });
    assert.ok(failed(await verify()).includes("split-history"), what);
    if (splitToo) assert.ok(failed(await verifyRouterSplit(a.pub, { router })).includes("split-history"), what);
    await a.admin.setStorageAt({ address: router, index, value: original });
    passes(await verify(), "restored");
    passes(await verifyRouterSplit(a.pub, { router }), "restored");
  };
  await forge("0x1", word((4000n << 160n) | BigInt(holderC)), "payee changed without PayeeChanged", true);
  await forge("0x1", word((5000n << 160n) | BigInt(holderA)), "holder share changed without HolderShareRaised", true);
  await forge("0x2", word((1n << 160n) | BigInt(holderC)), "a pending payee without PayeeChangeProposed", false);
});
