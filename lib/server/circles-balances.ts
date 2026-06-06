/**
 * Read a Circles avatar's balances for the wallet view.
 *
 * `circles_getTokenBalances` (Circles RPC) returns every token the avatar holds
 * with its demurraged `attoCircles` value, the `tokenOwner` (whose CRC it is)
 * and an `isGroup` flag — so in one call we get:
 *   - held personal CRC  = sum of the avatar's *own* token (any wrapped form)
 *   - held group CRC      = sum of the score group's token
 *   - (held trophies)     = other humans' CRC (future: personal-mode winnings)
 *
 * Mintable (accrued-but-unminted) personal CRC comes from `Hub.calculateIssuance`.
 *
 * Note: the permissionless-groups SDK is gCRC-only, so personal balances are read
 * here directly off the RPC / Hub.
 */
import { createPublicClient, http, parseAbiItem, getAddress } from "viem";
import { gnosis } from "viem/chains";
import { CIRCLES_RPC_URL, HUB_V2_ADDRESS, SCORE_GROUP_ADDRESS } from "@/lib/circles-config";

const publicClient = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });

const calculateIssuanceAbi = [
  parseAbiItem(
    "function calculateIssuance(address _human) view returns (uint256 issuance, uint256 startPeriod, uint256 endPeriod)"
  ),
];

interface TokenBalance {
  tokenOwner?: string;
  attoCircles?: string;
  isGroup?: boolean;
}

export interface Balances {
  /** Demurraged atto-CRC of the avatar's own personal token (all forms). */
  heldPersonalAtto: string;
  /** Demurraged atto-CRC of the score group's token. */
  heldGroupAtto: string;
  /** Accrued-but-unminted personal CRC the avatar can mint now (atto). */
  mintableAtto: string;
}

export async function getBalances(address: string): Promise<Balances> {
  const addr = getAddress(address);
  const lc = addr.toLowerCase();
  const group = SCORE_GROUP_ADDRESS.toLowerCase();

  // All held tokens, with demurraged values.
  let tokens: TokenBalance[] = [];
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "circles_getTokenBalances",
        params: [addr],
      }),
    });
    const json = await res.json();
    tokens = Array.isArray(json?.result) ? json.result : [];
  } catch {
    tokens = [];
  }

  const sumWhere = (pred: (t: TokenBalance) => boolean) =>
    tokens.filter(pred).reduce((a, t) => a + BigInt(t.attoCircles ?? "0"), 0n);

  const heldPersonal = sumWhere((t) => (t.tokenOwner ?? "").toLowerCase() === lc && !t.isGroup);
  const heldGroup = sumWhere((t) => (t.tokenOwner ?? "").toLowerCase() === group);

  // Mintable accrued personal CRC (reverts if the human can't mint → 0).
  let mintable = 0n;
  try {
    const out = (await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: calculateIssuanceAbi,
      functionName: "calculateIssuance",
      args: [addr as `0x${string}`],
    })) as readonly [bigint, bigint, bigint];
    mintable = out[0];
  } catch {
    mintable = 0n;
  }

  return {
    heldPersonalAtto: heldPersonal.toString(),
    heldGroupAtto: heldGroup.toString(),
    mintableAtto: mintable.toString(),
  };
}
