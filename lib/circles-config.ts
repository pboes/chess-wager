/**
 * Shared Circles configuration for Chess Wager.
 *
 * All addresses are on Gnosis Chain (chainId 100). The score-groups stack
 * (pathfinder + indexer used by the permissionless-groups package) lives on the
 * staging RPC; the on-chain contracts (Hub V2, Lift) are production.
 *
 * Funds custody mirrors the puzzle app: a registered Circles **org Safe** (the
 * escrow) collects both players' stakes per challenge and pays the winner,
 * signed by an owner EOA (threshold 1). The EOA only signs — it never holds
 * funds.
 */
import type { Address } from "viem";

/**
 * The dedicated escrow org Safe ("Chess Wager Escrow"). Holds live stakes and
 * pays winners / refunds. Set via env so it stays separate from the puzzle org.
 * Until provisioned, on-chain settle/payout will assert this is configured.
 */
export const ESCROW_ADDRESS = (process.env.ESCROW_ORG_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

/** The EOA that signs for the escrow Safe (a Safe owner). Only signs. */
export const ESCROW_SIGNER_ADDRESS =
  "0x4Fb303cBDfe086311a875944Fd401DA6A92cDe2C" as Address;

/** Score-gated permissionless group whose CRC is the v1 stake currency (gCRC). */
export const SCORE_GROUP_ADDRESS =
  "0x93eD5A96347927ff6fF6b790F8Cf5258240c321f" as Address;

/** Hub V2 (production). */
export const HUB_V2_ADDRESS =
  "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8" as Address;

/** LiftERC20 (production) — resolves the group's ERC20 wrapper addresses. */
export const LIFT_ERC20_ADDRESS =
  "0x5F99a795dD2743C36D63511f0D4bc667e6d3cDB5" as Address;

export const CIRCLES_RPC_URL = "https://rpc.aboutcircles.com/";
export const SCORE_GROUPS_RPC_URL = "https://rpc.staging.aboutcircles.com/";
export const SCORE_GROUPS_BACKEND_URL =
  "https://rpc.staging.aboutcircles.com/score-groups";

/** Minimum stake a challenge may set, in whole gCRC. */
export const MIN_STAKE_CRC = Number(process.env.NEXT_PUBLIC_MIN_STAKE_CRC ?? "1");

export function assertEscrowConfigured(): void {
  if (ESCROW_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error("ESCROW_ORG_ADDRESS is not configured");
  }
}
