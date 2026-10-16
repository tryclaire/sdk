import type { Address } from "viem";

/**
 * The contracts of one Claire protocol deployment, with the field names of the protocol's deploy manifest (`deployments/<chainId>.json`).
 * Routers, project holder distributors and airdrop distributors are created per launch and read from these.
 */
export type ClaireDeployment = {
  routerFactory: Address; routerDeployer: Address; tokenLock: Address; revenueLock: Address; priceLock: Address; distributorFactory: Address; vaultFactory: Address; proofView: Address;
  claireHolderDistributor: Address; referralDistributor: Address; treasury: Address; feeToken: Address;
  /** The chain height before the deployment transactions (the manifest's `block`): the default start of the verifiers' event scans on that chain. */
  block: bigint;
};

/** Known deployments by chain ID. Every function takes explicit addresses; spread an entry in when one is listed. */
export const deployments: Readonly<Record<number, ClaireDeployment>> = {};
