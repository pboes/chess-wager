/**
 * Build the txs to stake `amountAtto` (demurraged) of the avatar's **own**
 * personal CRC into the escrow, via a **direct** ERC1155 transfer (no pathfinder).
 *
 * Mirrors the gCRC stake transfer, but for the avatar's personal token id and
 * sourcing the balance breakdown from `circles_getTokenBalances` (the groups SDK
 * is gCRC-only). Sources native ERC1155 first, then unwraps the personal
 * demurrage / inflationary wrappers (with the same sub-wei buffer), then
 * `Hub.safeTransferFrom`s exactly the amount.
 */
import { createPublicClient, encodeFunctionData, http, parseAbiItem, type Address } from "viem";
import { gnosis } from "viem/chains";
import { CirclesConverter } from "@aboutcircles/sdk-utils/circlesConverter";
import { CIRCLES_RPC_URL, HUB_V2_ADDRESS } from "@/lib/circles-config";

export interface SimpleTx {
  to: string;
  data: string;
  value: string;
}

const UNWRAP_ABI = [
  { name: "unwrap", type: "function", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;

const PERSONAL_MINT_ABI = [
  { name: "personalMint", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

const publicClient = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });
const calculateIssuanceAbi = [
  parseAbiItem(
    "function calculateIssuance(address _human) view returns (uint256 issuance, uint256 startPeriod, uint256 endPeriod)"
  ),
];

/** Accrued-but-unminted personal CRC the avatar can mint right now (atto, demurraged). 0 if it can't mint. */
async function mintableAtto(avatar: Address): Promise<bigint> {
  try {
    const out = (await publicClient.readContract({
      address: HUB_V2_ADDRESS,
      abi: calculateIssuanceAbi,
      functionName: "calculateIssuance",
      args: [avatar],
    })) as readonly [bigint, bigint, bigint];
    return out[0];
  } catch {
    return 0n;
  }
}

const SAFE_TRANSFER_FROM_ABI = [
  {
    name: "safeTransferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes" },
    ],
    outputs: [],
  },
] as const;

interface TokenBalance {
  tokenOwner?: string;
  tokenAddress?: string;
  isErc1155?: boolean;
  isErc20?: boolean;
  isInflationary?: boolean;
  isGroup?: boolean;
  attoCircles?: string;
  staticAttoCircles?: string;
}

async function tokenBalances(addr: string): Promise<TokenBalance[]> {
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
    const j = await res.json();
    return Array.isArray(j?.result) ? j.result : [];
  } catch {
    return [];
  }
}

export async function buildPersonalStakeTxs(
  avatar: Address,
  to: Address,
  amountAtto: bigint
): Promise<SimpleTx[]> {
  const lc = avatar.toLowerCase();
  const own = (await tokenBalances(avatar)).filter(
    (t) => (t.tokenOwner ?? "").toLowerCase() === lc && !t.isGroup
  );
  const tokenId = BigInt(avatar); // personal token id == uint256(uint160(avatar))

  const native = own
    .filter((t) => t.isErc1155)
    .reduce((a, t) => a + BigInt(t.attoCircles ?? "0"), 0n);
  const demWrap = own.find((t) => t.isErc20 && !t.isInflationary);
  const infWrap = own.find((t) => t.isErc20 && t.isInflationary);

  const txs: SimpleTx[] = [];

  // Mint accrued personal CRC under the hood — the user never claims manually.
  // personalMint() adds the accrued issuance to the native ERC1155 balance, so we
  // count it as available before reaching for the wrappers.
  const accrued = await mintableAtto(avatar);
  if (accrued > 0n) {
    txs.push({
      to: HUB_V2_ADDRESS,
      data: encodeFunctionData({ abi: PERSONAL_MINT_ABI, functionName: "personalMint" }),
      value: "0",
    });
  }

  const available = native + accrued;
  let need = amountAtto > available ? amountAtto - available : 0n;

  // Cover from the demurrage wrapper (1:1 demurraged).
  if (need > 0n && demWrap) {
    const avail = BigInt(demWrap.attoCircles ?? "0");
    const take = need < avail ? need : avail;
    if (take > 0n) {
      txs.push({
        to: demWrap.tokenAddress!,
        data: encodeFunctionData({ abi: UNWRAP_ABI, functionName: "unwrap", args: [take] }),
        value: "0",
      });
      need -= take;
    }
  }

  // Cover the rest from the inflationary wrapper (static units + buffer to beat
  // the truncating on-chain unwrap).
  if (need > 0n && infWrap) {
    let staticAmt = CirclesConverter.attoCirclesToAttoStaticCircles(need);
    staticAmt += staticAmt / 10000n + 10n ** 12n;
    const availStatic = BigInt(infWrap.staticAttoCircles ?? "0");
    if (staticAmt > availStatic) staticAmt = availStatic;
    if (staticAmt > 0n) {
      txs.push({
        to: infWrap.tokenAddress!,
        data: encodeFunctionData({ abi: UNWRAP_ABI, functionName: "unwrap", args: [staticAmt] }),
        value: "0",
      });
    }
  }

  // Direct transfer of exactly the amount to the escrow.
  txs.push({
    to: HUB_V2_ADDRESS,
    data: encodeFunctionData({
      abi: SAFE_TRANSFER_FROM_ABI,
      functionName: "safeTransferFrom",
      args: [avatar, to, tokenId, amountAtto, "0x"],
    }),
    value: "0",
  });

  return txs;
}
