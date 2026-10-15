import assert from "node:assert/strict";
import test from "node:test";
import { concat, keccak256 } from "viem";
import { claireFeeRouterAbi, claireRevenueLockAbi, deployments, manifestEvidence, merkleProof, merkleRoot, parseRoundManifest, roundLeafHash } from "../dist/protocol/index.js";

const distributor = "0x00000000000000000000000000000000000000d1";
const leaves = [1, 2, 3, 4, 5].map((i) => ({ index: i - 1, account: `0x${i.toString(16).padStart(40, "0")}`, amount: String(i * 1000) }));
const hashes = leaves.map((leaf) => roundLeafHash(31337, distributor, 7n, leaf));

// Fixed vectors: leaf and evidence hashes computed with `cast keccak` over `cast abi-encode`; the root and proofs by the reference below.
test("leaf and evidence hashes match fixed vectors", () => {
  assert.equal(hashes[0], "0x31fcd771b3b2f3fea31207c7a71819beeb1e48ff05472fd7c82bf5fb73ff0d49");
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
  assert.equal(merkleRoot(hashes), "0x66d388bfc8d2c3a77559a6fe915ce21fce1f660ace051e58b30d982ac23614cd");
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
    kind: "claire-round", version: 1, purpose: "claire-holders", chainId: 1, distributor, asset: distributor, total: "10",
    snapshot: { chainId: 1, block: "5", token: distributor }, rule: { type: "pro-rata", distributable: "10", eligibleBalance: "3", excluded: [], minBalance: null },
    leaves: [{ index: 0, account: leaves[0].account, amount: "10", balance: "3" }],
  };
  assert.deepEqual(parseRoundManifest(JSON.stringify(manifest)), manifest);
  assert.throws(() => parseRoundManifest(JSON.stringify({ ...manifest, version: 2 })), /kind or version/);
  assert.throws(() => parseRoundManifest(JSON.stringify({ ...manifest, leaves: [{ ...manifest.leaves[0], index: 1 }] })), /leaf 0/);
  assert.throws(() => parseRoundManifest(JSON.stringify({ ...manifest, distributor: distributor.toUpperCase().replace("0X", "0x") })), /distributor/);
});

test("exports the router and revenue lock surface", () => {
  const names = (abi) => abi.map((item) => item.name);
  assert.ok(names(claireFeeRouterAbi).includes("totalRevenue") && names(claireFeeRouterAbi).includes("quote") && names(claireFeeRouterAbi).includes("OpeningBuyLocked"));
  assert.ok(names(claireRevenueLockAbi).includes("RevenueLockCreated"));
  assert.deepEqual(deployments, {});
});
