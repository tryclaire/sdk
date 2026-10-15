import { concat, encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";

/** One allocation of a distributor round; `amount` is a raw integer string, exactly what the Merkle leaf commits to. */
export type RoundLeaf = { index: number; account: Address; amount: string };

/** `ClaireDistributor.leaf`: the double-hashed encoding of chain, distributor, round, index, account and amount. */
export function roundLeafHash(chainId: number, distributor: Address, roundId: bigint, leaf: RoundLeaf): Hex {
  return keccak256(keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "uint128" }],
    [BigInt(chainId), distributor, roundId, BigInt(leaf.index), leaf.account, BigInt(leaf.amount)],
  )));
}

/** Sorted-pair layers matching `ClaireDistributor`'s verifier; an unpaired node moves up unchanged. */
function layers(leaves: Hex[]) {
  if (!leaves.length) throw new Error("A Merkle tree needs at least one leaf");
  const all = [leaves];
  for (let level = leaves; level.length > 1; level = all[all.length - 1]!) {
    all.push(Array.from({ length: Math.ceil(level.length / 2) }, (_, i) => {
      const [a, b] = [level[2 * i]!, level[2 * i + 1]];
      return b ? keccak256(a.toLowerCase() < b.toLowerCase() ? concat([a, b]) : concat([b, a])) : a;
    }));
  }
  return all;
}

export const merkleRoot = (leaves: Hex[]): Hex => layers(leaves).at(-1)![0]!;

/** The sibling hashes to pass as `proof` to `ClaireDistributor.claim` for the leaf at `index`. */
export function merkleProof(leaves: Hex[], index: number): Hex[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new Error("Leaf index out of range");
  const proof: Hex[] = [];
  for (const level of layers(leaves).slice(0, -1)) {
    const sibling = level[index ^ 1];
    if (sibling) proof.push(sibling);
    index >>= 1;
  }
  return proof;
}

/** The on-chain `evidence` of a round: keccak256 of the manifest's UTF-8 bytes exactly as published. */
export const manifestEvidence = (manifest: string): Hex => keccak256(toHex(manifest));
