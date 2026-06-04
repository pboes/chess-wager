/**
 * Build a stake transfer (player → escrow Safe) as **native** group-CRC.
 *
 * Same approach (and rationale) as the puzzle's entry transfer: the SDK's
 * `transferGroupCrc` has a sub-wei rounding bug on the org/ERC1155 recipient
 * path — it unwraps the static-equivalent and then `safeTransferFrom`s the full
 * demurraged amount, but the on-chain unwrap truncates, yielding a hair less,
 * so the transfer reverts. Fix: unwrap the amount's worth **plus a small
 * buffer**, then transfer exactly the amount. Sources native ERC1155 first,
 * then the demurrage wrapper, then the inflationary wrapper.
 *
 * Token-agnostic-ready: v1 always uses the group token id; a future personal-CRC
 * mode would pass a different token id.
 */
import { encodeFunctionData, type Address } from "viem";
import { CirclesConverter } from "@aboutcircles/sdk-utils/circlesConverter";
import type { PermissionlessGroup } from "@aboutcircles/sdk-permissionless-groups";
import { HUB_V2_ADDRESS, SCORE_GROUP_ADDRESS } from "./circles-config";

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

export async function buildStakeTransferTxs(
  group: PermissionlessGroup,
  avatar: Address,
  to: Address,
  amountAtto: bigint,
  /** Native group-CRC a preceding migration step will mint before this runs. */
  extraNativeAtto = 0n
): Promise<SimpleTx[]> {
  const bd = await group.balanceBreakdown(avatar);
  const tokenId = BigInt(SCORE_GROUP_ADDRESS); // Hub id == uint256(uint160(group))
  const txs: SimpleTx[] = [];

  const availableNative = bd.erc1155 + extraNativeAtto;
  let need = amountAtto > availableNative ? amountAtto - availableNative : 0n;

  if (need > 0n && bd.demurrageWrapper > 0n) {
    const take = need < bd.demurrageWrapper ? need : bd.demurrageWrapper;
    txs.push({
      to: bd.demurrageWrapperAddress,
      data: encodeFunctionData({ abi: UNWRAP_ABI, functionName: "unwrap", args: [take] }),
      value: "0",
    });
    need -= take;
  }

  if (need > 0n) {
    let staticAmt = CirclesConverter.attoCirclesToAttoStaticCircles(need);
    staticAmt += staticAmt / 10000n + 10n ** 12n; // ~0.01% + 1e-6 CRC buffer
    if (staticAmt > bd.inflationaryWrapper) staticAmt = bd.inflationaryWrapper;
    txs.push({
      to: bd.inflationaryWrapperAddress,
      data: encodeFunctionData({ abi: UNWRAP_ABI, functionName: "unwrap", args: [staticAmt] }),
      value: "0",
    });
  }

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
