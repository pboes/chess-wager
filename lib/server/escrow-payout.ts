/**
 * Move group-CRC out of the escrow Safe — winner payouts and refunds.
 *
 * Uses the SDK's `transferGroupCrc` (which consolidates the Safe's group-CRC
 * across native ERC1155 + wrapped ERC20) and executes the batch through
 * `SafeContractRunner`, signed by the escrow's owner EOA (threshold 1). The EOA
 * only signs; funds move from the registered escrow org. Same machinery as the
 * puzzle pot payout.
 */
import { encodeFunctionData, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gnosis } from "viem/chains";
import { SafeContractRunner } from "@aboutcircles/sdk-runner";
import { getPermissionlessGroup } from "@/lib/permissionless-group";
import {
  CIRCLES_RPC_URL,
  ESCROW_ADDRESS,
  ESCROW_SIGNER_ADDRESS,
  HUB_V2_ADDRESS,
  assertEscrowConfigured,
} from "@/lib/circles-config";

export interface EscrowTransferResult {
  to: string;
  amountAtto: string;
  mode: string;
  txHash: string;
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

/** Validate the escrow signer key and return it. */
function escrowSignerKey(): Hex {
  assertEscrowConfigured();
  const pk = process.env.ESCROW_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("ESCROW_PRIVATE_KEY is not configured");
  const account = privateKeyToAccount(pk);
  if (getAddress(account.address) !== getAddress(ESCROW_SIGNER_ADDRESS)) {
    throw new Error("ESCROW_PRIVATE_KEY is not the escrow Safe's signer EOA");
  }
  return pk;
}

/**
 * Direct ERC1155 transfer of a specific Hub token from the escrow — personal
 * payouts/refunds (the winner gets the loser's personal CRC as a trophy). The
 * escrow holds it as native ERC1155 (deposited by the stake), so a plain
 * `safeTransferFrom` suffices.
 */
export async function escrowTransferToken(
  tokenId: bigint,
  to: string,
  amountAtto: bigint
): Promise<EscrowTransferResult> {
  const pk = escrowSignerKey();
  if (amountAtto <= 0n) throw new Error("Refusing to transfer a non-positive amount");
  const recipient = getAddress(to);
  const data = encodeFunctionData({
    abi: SAFE_TRANSFER_FROM_ABI,
    functionName: "safeTransferFrom",
    args: [ESCROW_ADDRESS, recipient, tokenId, amountAtto, "0x"],
  });
  const runner = await SafeContractRunner.create(
    CIRCLES_RPC_URL,
    pk,
    ESCROW_ADDRESS as `0x${string}`,
    gnosis
  );
  const receipt = await runner.sendTransaction([
    { to: HUB_V2_ADDRESS, data, value: 0n },
  ]);
  return {
    to: recipient,
    amountAtto: amountAtto.toString(),
    mode: "erc1155",
    txHash: receipt.transactionHash,
  };
}

/** Send exactly `amountAtto` (demurraged) group-CRC from the escrow to `to`. */
export async function escrowPay(
  to: string,
  amountAtto: bigint
): Promise<EscrowTransferResult> {
  assertEscrowConfigured();
  const pk = process.env.ESCROW_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("ESCROW_PRIVATE_KEY is not configured");

  const account = privateKeyToAccount(pk);
  if (getAddress(account.address) !== getAddress(ESCROW_SIGNER_ADDRESS)) {
    throw new Error("ESCROW_PRIVATE_KEY is not the escrow Safe's signer EOA");
  }
  if (amountAtto <= 0n) throw new Error("Refusing to transfer a non-positive amount");

  const recipient = getAddress(to);
  const group = getPermissionlessGroup();

  const { txs, mode } = await group.transferGroupCrc({
    avatar: ESCROW_ADDRESS as `0x${string}`,
    to: recipient,
    amount: amountAtto,
  });

  const runner = await SafeContractRunner.create(
    CIRCLES_RPC_URL,
    pk,
    ESCROW_ADDRESS as `0x${string}`,
    gnosis
  );
  const receipt = await runner.sendTransaction(txs);

  return {
    to: recipient,
    amountAtto: amountAtto.toString(),
    mode,
    txHash: receipt.transactionHash,
  };
}
