/**
 * Claim accrued personal CRC: `Hub.personalMint()` then `Hub.wrap(...)` into the
 * **inflationary** ERC20, so the claimed amount stays constant (doesn't
 * demurrage away). Sent as one host-signed batch.
 *
 * The groups SDK is gCRC-only, so this is built as direct Hub calldata.
 */
import { encodeFunctionData, type Address } from "viem";
import { HUB_V2_ADDRESS } from "@/lib/circles-config";

export interface SimpleTx {
  to: string;
  data: string;
  value: string;
}

const PERSONAL_MINT_ABI = [
  { name: "personalMint", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;

const WRAP_ABI = [
  {
    name: "wrap",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_avatar", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_type", type: "uint8" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

/** enum CirclesType { Demurrage, Inflation } — Inflation keeps a constant balance. */
const CIRCLES_TYPE_INFLATION = 1;

export function buildClaimTxs(avatar: Address, mintableAtto: bigint): SimpleTx[] {
  const txs: SimpleTx[] = [
    {
      to: HUB_V2_ADDRESS,
      data: encodeFunctionData({ abi: PERSONAL_MINT_ABI, functionName: "personalMint" }),
      value: "0",
    },
  ];
  // Wrap the just-minted amount to inflationary so it stays constant. (Mint may
  // accrue a hair more by execution time; wrapping the read amount is ≤ minted.)
  if (mintableAtto > 0n) {
    txs.push({
      to: HUB_V2_ADDRESS,
      data: encodeFunctionData({
        abi: WRAP_ABI,
        functionName: "wrap",
        args: [avatar, mintableAtto, CIRCLES_TYPE_INFLATION],
      }),
      value: "0",
    });
  }
  return txs;
}
