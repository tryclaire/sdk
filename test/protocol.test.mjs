import assert from "node:assert/strict";
import test from "node:test";
import { concat, keccak256 } from "viem";
import { claireDistributorAbi, claireFeeRouterAbi, clairePriceLockAbi, claireProofViewAbi, claireRevenueLockAbi, claireRouterDeployerAbi, claireSplitAbi, claireVaultFactoryAbi, claireVestingVaultAbi, deployments, manifestEvidence, merkleProof, merkleRoot, parseRoundManifest, roundLeafHash } from "../dist/protocol/index.js";

const distributor = "0x00000000000000000000000000000000000000d1";
const asset = "0x00000000000000000000000000000000000000a5";
const leaves = [1, 2, 3, 4, 5].map((i) => ({ account: `0x${i.toString(16).padStart(40, "0")}`, cumulative: String(i * 1000) }));
const hashes = leaves.map((leaf) => roundLeafHash(31337, distributor, asset, leaf));

// Fixed vectors: leaf and evidence hashes computed with `cast keccak` over `cast abi-encode`; the root and proofs by the reference below.
test("leaf and evidence hashes match fixed vectors", () => {
  assert.equal(hashes[0], "0x582720671565832db741f1334ffb570650a2f7cbde0b64269eb3e1f9ad69cddf");
  assert.equal(manifestEvidence('{"a":1}'), "0x25e7c2a96531eb50246780c1f25742e489bf55210e26981dc02992bb585feb97");
});

// Reference tree written the way the protocol's test utility and ClaireDistributor._verify build it: sorted pairs, odd node promoted.
function reference(level) {
  const layers = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const [a, b] = [level[i], level[i + 1]];
      next.push(b === undefined ? a : BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a])));
    }
    layers.push((level = next));
  }
  return layers;
}
const verify = (proof, root, node) => proof.reduce((n, s) => (BigInt(n) < BigInt(s) ? keccak256(concat([n, s])) : keccak256(concat([s, n]))), node) === root;

test("Merkle root and proofs match the contract's sorted-pair layout for every tree size", () => {
  assert.equal(merkleRoot(hashes), reference(hashes).at(-1)[0]);
  for (let size = 1; size <= 9; size++) {
    const nodes = Array.from({ length: size }, (_, i) => keccak256(`0x${(i + 1).toString(16).padStart(2, "0")}`));
    const root = merkleRoot(nodes);
    assert.equal(root, reference(nodes).at(-1)[0]);
    nodes.forEach((node, i) => assert.ok(verify(merkleProof(nodes, i), root, node), `size ${size} leaf ${i}`));
  }
  assert.throws(() => merkleRoot([]));
  assert.throws(() => merkleProof(hashes, 5));
});

test("manifest parsing accepts the canonical shape and rejects anything else", () => {
  const manifest = {
    kind: "claire-round", version: 1, purpose: "claire-holders", chainId: 1, distributor, asset, previousEvidence: null, total: "10", cumulativeTotal: "15",
    snapshot: { chainId: 1, block: "5", token: distributor }, rule: { type: "pro-rata", distributable: "10", eligibleBalance: "3", excluded: [], minBalance: null },
    leaves: [{ account: leaves[0].account, amount: "10", cumulative: "10", balance: "3" }, { account: leaves[1].account, amount: "0", cumulative: "5", balance: null }],
  };
  assert.deepEqual(parseRoundManifest(JSON.stringify(manifest)), manifest);
  const bad = (patch, pattern) => assert.throws(() => parseRoundManifest(JSON.stringify({ ...manifest, ...patch })), pattern);
  bad({ version: 2 }, /kind or version/);
  bad({ previousEvidence: "0xAB" }, /previousEvidence/);
  bad({ leaves: [{ ...manifest.leaves[0], amount: "11" }] }, /leaf 0/);
  bad({ leaves: [manifest.leaves[1], manifest.leaves[0]] }, /ascending/);
  bad({ leaves: [manifest.leaves[0], manifest.leaves[0]] }, /ascending/);
  bad({ distributor: distributor.toUpperCase().replace("0X", "0x") }, /distributor/);
});

test("exports every contract surface", () => {
  const names = (abi) => abi.map((item) => item.name);
  assert.ok(names(claireFeeRouterAbi).includes("payee") && names(claireFeeRouterAbi).includes("setBuyback") && names(claireFeeRouterAbi).includes("stockereumPoolId") && names(claireFeeRouterAbi).includes("BuybackSet"));
  assert.ok(["raiseHolderShare", "proposePayee", "cancelPayee", "applyPayee", "pendingPayee", "payeeChangeAt", "PAYEE_DELAY", "HolderShareRaised", "PayeeChanged"].every((name) => names(claireFeeRouterAbi).includes(name)) && names(claireRouterDeployerAbi).includes("predict"));
  assert.ok(names(claireRevenueLockAbi).includes("RevenueLockCreated") && names(clairePriceLockAbi).includes("highWater") && names(claireProofViewAbi).includes("proof"));
  assert.ok(names(claireDistributorAbi).includes("cumulativeTotal") && names(claireVestingVaultAbi).includes("vested") && names(claireSplitAbi).includes("shares") && names(claireVaultFactoryAbi).includes("predictVault"));
  assert.deepEqual(deployments, {});
});
