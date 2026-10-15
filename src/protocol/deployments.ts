import type { Address } from "viem";

/** The contracts of one Claire deployment. Routers, distributors and airdrop distributors are created per launch and read from these. */
export type ClaireDeployment = { routerFactory: Address; tokenLock: Address; revenueLock: Address };

/** Known deployments by chain ID. Every function takes explicit addresses; spread an entry in when one is listed. */
export const deployments: Readonly<Record<number, ClaireDeployment>> = {};
