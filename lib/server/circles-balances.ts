/**
 * Read an avatar's spendable **points** (personal CRC), authoritatively.
 *
 * Following the dAMS pilot (CirclesMiniapps `pilots/dams/circles.ts`): the
 * numbers that gate play are read **straight from the Hub**, never synthesized
 * from the indexer (which lags):
 *   - personal CRC held as ERC1155      → Hub.balanceOf(addr, tokenId)
 *   - personal minting rights (accrued) → Hub.calculateIssuance(addr)[0]
 *
 * Points the user can stake right now = held personal CRC (ERC1155 + any wrapped
 * ERC20 forms) + mintable. The wrapped-ERC20 amounts (demurraged / inflationary
 * leftovers) are read off the indexer for their today-value, since their wrapper
 * addresses live there; the ERC1155 + mintable core is direct from the Hub.
 *
 * Group (gCRC) holdings stay indexer-derived — they're informational only.
 */
import { createPublicClient, http, getAddress, type Address } from "viem";
import { gnosis } from "viem/chains";
import { CIRCLES_RPC_URL, HUB_V2_ADDRESS, SCORE_GROUP_ADDRESS } from "@/lib/circles-config";

const publicClient = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });

const hubAbi = [
  {
    type: "function",
    name: "isHuman",
    stateMutability: "view",
    inputs: [{ name: "_human", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "_account", type: "address" },
      { name: "_id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "calculateIssuance",
    stateMutability: "view",
    inputs: [{ name: "_human", type: "address" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
  },
] as const;

interface TokenBalance {
  tokenOwner?: string;
  attoCircles?: string;
  isGroup?: boolean;
  isErc20?: boolean;
  isWrapped?: boolean;
}

export interface Balances {
  /** Today-value atto-CRC of the avatar's own personal token (ERC1155 + wrapped). */
  heldPersonalAtto: string;
  /** Today-value atto-CRC of the score group's token (informational). */
  heldGroupAtto: string;
  /** Accrued-but-unminted personal CRC the avatar can mint now (atto). */
  mintableAtto: string;
}

async function indexerTokens(addr: string): Promise<TokenBalance[]> {
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
    return Array.isArray(json?.result) ? json.result : [];
  } catch {
    return [];
  }
}

export async function getBalances(address: string): Promise<Balances> {
  const addr = getAddress(address);
  const lc = addr.toLowerCase();
  const group = SCORE_GROUP_ADDRESS.toLowerCase();
  const tokenId = BigInt(addr); // Hub V2 token id == uint256(uint160(avatar))

  // Authoritative, straight from the Hub.
  const [isHuman, erc1155] = await Promise.all([
    publicClient
      .readContract({ address: HUB_V2_ADDRESS, abi: hubAbi, functionName: "isHuman", args: [addr] })
      .catch(() => false),
    publicClient
      .readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: "balanceOf",
        args: [addr, tokenId],
      })
      .catch(() => 0n),
  ]);

  // calculateIssuance reverts when there's nothing to mint yet — treat as 0.
  let mintable = 0n;
  if (isHuman) {
    try {
      const out = (await publicClient.readContract({
        address: HUB_V2_ADDRESS,
        abi: hubAbi,
        functionName: "calculateIssuance",
        args: [addr],
      })) as readonly [bigint, bigint, bigint];
      mintable = out[0];
    } catch {
      mintable = 0n;
    }
  }

  // Wrapped ERC20 personal CRC (demurraged / inflationary leftovers) + group, by
  // today-value, from the indexer — wrapper addresses & group balances live here.
  const tokens = await indexerTokens(addr);
  const wrappedPersonal = tokens
    .filter(
      (t) =>
        (t.tokenOwner ?? "").toLowerCase() === lc && !t.isGroup && t.isErc20 && t.isWrapped
    )
    .reduce((a, t) => a + BigInt(t.attoCircles ?? "0"), 0n);
  const heldGroup = tokens
    .filter((t) => (t.tokenOwner ?? "").toLowerCase() === group)
    .reduce((a, t) => a + BigInt(t.attoCircles ?? "0"), 0n);

  return {
    heldPersonalAtto: ((erc1155 as bigint) + wrappedPersonal).toString(),
    heldGroupAtto: heldGroup.toString(),
    mintableAtto: mintable.toString(),
  };
}
