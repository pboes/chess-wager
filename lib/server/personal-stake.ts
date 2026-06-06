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
import { encodeFunctionData, type Address } from "viem";
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
  let need = amountAtto > native ? amountAtto - native : 0n;

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
