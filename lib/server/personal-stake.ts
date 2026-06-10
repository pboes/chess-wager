/**
 * Build the txs to stake `amountAtto` (today-value) of the avatar's **own**
 * personal CRC into the escrow, via a **direct** ERC1155 transfer (no pathfinder).
 *
 * Following the dAMS pilot, balances that drive the batch are read straight from
 * the Hub (`balanceOf`, `calculateIssuance`), not the lagging indexer. The flow,
 * as specified:
 *   1. personalMint() any accrued points (→ ERC1155),
 *   2. cover the stake from ERC1155 (minted + held), unwrapping the demurraged /
 *      inflationary wrappers only if that isn't enough,
 *   3. transfer exactly the stake to the escrow,
 *   4. wrap the whole-CRC remainder back into **demurraged ERC20**, so the
 *      player's leftover points sit in the canonical form.
 *
 * The wrapper *addresses* (needed to unwrap) still come from the indexer — only
 * the Hub holds them. Hub.wrap deploys the demurraged wrapper if absent and is
 * the last tx, so step 4 never needs the wrapper address up front.
 */
import { createPublicClient, encodeFunctionData, http, type Address } from "viem";
import { gnosis } from "viem/chains";
import { CirclesConverter } from "@aboutcircles/sdk-utils/circlesConverter";
import { CIRCLES_RPC_URL, HUB_V2_ADDRESS } from "@/lib/circles-config";

export interface SimpleTx {
  to: string;
  data: string;
  value: string;
}

const ONE = 10n ** 18n;
const CIRCLES_TYPE_DEMURRAGE = 0; // CirclesType enum: 0 = Demurrage, 1 = Inflation

const publicClient = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });

const hubAbi = [
  { name: "personalMint", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "calculateIssuance",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
  },
  {
    name: "wrap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint8" }],
    outputs: [{ type: "address" }],
  },
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

const UNWRAP_ABI = [
  { name: "unwrap", type: "function", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
] as const;

interface TokenBalance {
  tokenOwner?: string;
  tokenAddress?: string;
  isErc20?: boolean;
  isWrapped?: boolean;
  isInflationary?: boolean;
  isGroup?: boolean;
  attoCircles?: string;
  staticAttoCircles?: string;
}

const floorToWhole = (atto: bigint): bigint => (atto > 0n ? (atto / ONE) * ONE : 0n);

async function indexerTokens(addr: string): Promise<TokenBalance[]> {
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_getTokenBalances", params: [addr] }),
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
  const tokenId = BigInt(avatar); // personal token id == uint256(uint160(avatar))

  // Authoritative reads from the Hub.
  const [erc1155, issuance] = await Promise.all([
    publicClient
      .readContract({ address: HUB_V2_ADDRESS, abi: hubAbi, functionName: "balanceOf", args: [avatar, tokenId] })
      .catch(() => 0n) as Promise<bigint>,
    publicClient
      .readContract({ address: HUB_V2_ADDRESS, abi: hubAbi, functionName: "calculateIssuance", args: [avatar] })
      .catch(() => [0n, 0n, 0n] as readonly [bigint, bigint, bigint]),
  ]);
  const mintable = (issuance as readonly bigint[])[0] ?? 0n;

  // Wrapper addresses (+ balances) from the indexer.
  const own = (await indexerTokens(avatar)).filter(
    (t) => (t.tokenOwner ?? "").toLowerCase() === lc && !t.isGroup && t.isErc20 && t.isWrapped
  );
  const demWrap = own.find((t) => !t.isInflationary);
  const infWrap = own.find((t) => t.isInflationary);

  const txs: SimpleTx[] = [];

  // 1. Mint accrued points under the hood (→ ERC1155).
  if (mintable > 0n) {
    txs.push({
      to: HUB_V2_ADDRESS,
      data: encodeFunctionData({ abi: hubAbi, functionName: "personalMint" }),
      value: "0",
    });
  }

  // 2. Cover the stake from ERC1155 (held + just-minted); unwrap only the shortfall.
  const nativeAfterMint = erc1155 + mintable;
  let need = amountAtto > nativeAfterMint ? amountAtto - nativeAfterMint : 0n;

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
  if (need > 0n && infWrap) {
    let staticAmt = CirclesConverter.attoCirclesToAttoStaticCircles(need);
    staticAmt += staticAmt / 10000n + 10n ** 12n; // buffer to beat the truncating unwrap
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

  // 3. Direct transfer of exactly the stake to the escrow.
  txs.push({
    to: HUB_V2_ADDRESS,
    data: encodeFunctionData({
      abi: hubAbi,
      functionName: "safeTransferFrom",
      args: [avatar, to, tokenId, amountAtto, "0x"],
    }),
    value: "0",
  });

  // 4. Wrap the whole-CRC remainder into demurraged ERC20 (only when nothing was
  //    unwrapped to cover the stake — i.e. we had a surplus). Floored to whole
  //    CRC so demurrage drift between read and execution can't overflow.
  if (need === 0n) {
    const remainder = floorToWhole(nativeAfterMint - amountAtto);
    if (remainder > 0n) {
      txs.push({
        to: HUB_V2_ADDRESS,
        data: encodeFunctionData({
          abi: hubAbi,
          functionName: "wrap",
          args: [avatar, remainder, CIRCLES_TYPE_DEMURRAGE],
        }),
        value: "0",
      });
    }
  }

  return txs;
}
