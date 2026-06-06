/**
 * Verify a transaction is a genuine group-CRC stake of at least `minAtto` into
 * the escrow, and return the **actual received** demurraged amount (so we can
 * record the true static value, not a nominal). Accepts both delivery shapes
 * `transferGroupCrc` / our stake-transfer emit: an ERC1155 `TransferSingle` of
 * the group token id, or an ERC20 `Transfer` (inflationary wrapper path).
 */
import {
  createPublicClient,
  http,
  decodeEventLog,
  parseAbiItem,
  getAddress,
  type Hash,
} from "viem";
import { gnosis } from "viem/chains";
import {
  CIRCLES_RPC_URL,
  ESCROW_ADDRESS,
  HUB_V2_ADDRESS,
  SCORE_GROUP_ADDRESS,
} from "@/lib/circles-config";

const publicClient = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });

const transferSingleAbi = parseAbiItem(
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
);
const erc20TransferAbi = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

const GROUP_TOKEN_ID = BigInt(SCORE_GROUP_ADDRESS);

export interface VerifyStakeResult {
  ok: boolean;
  reason?: string;
  from?: string;
  /** Actually-received demurraged atto-CRC. */
  receivedAtto?: bigint;
  mode?: "erc1155" | "erc20";
}

export async function verifyStakePayment(
  txHash: string,
  minAtto: bigint,
  expectedFrom: string | undefined,
  /** Hub token id expected into the escrow (group token, or a personal token). */
  tokenId: bigint
): Promise<VerifyStakeResult> {
  // A little slack for demurrage→inflationary truncation on the ERC20 path.
  const floor = (minAtto * 95n) / 100n;
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hash });
  } catch {
    return { ok: false, reason: "Transaction not found or not yet mined" };
  }
  if (receipt.status !== "success") return { ok: false, reason: "Transaction reverted" };

  const escrow = getAddress(ESCROW_ADDRESS);

  for (const log of receipt.logs) {
    if (getAddress(log.address) === getAddress(HUB_V2_ADDRESS)) {
      try {
        const { args, eventName } = decodeEventLog({
          abi: [transferSingleAbi],
          data: log.data,
          topics: log.topics,
        });
        if (
          eventName === "TransferSingle" &&
          getAddress(args.to as string) === escrow &&
          (args.id as bigint) === tokenId &&
          (args.value as bigint) >= floor
        ) {
          const from = getAddress(args.from as string);
          if (expectedFrom && from !== getAddress(expectedFrom)) continue;
          return { ok: true, from, receivedAtto: args.value as bigint, mode: "erc1155" };
        }
      } catch {
        /* not this event */
      }
    }

    // The ERC20 (wrapper) delivery path only applies to gCRC; personal stakes
    // arrive as a pure ERC1155 transfer.
    if (tokenId === GROUP_TOKEN_ID) {
      try {
        const { args, eventName } = decodeEventLog({
          abi: [erc20TransferAbi],
          data: log.data,
          topics: log.topics,
        });
        if (
          eventName === "Transfer" &&
          getAddress(args.to as string) === escrow &&
          (args.value as bigint) >= floor
        ) {
          const from = getAddress(args.from as string);
          if (expectedFrom && from !== getAddress(expectedFrom)) continue;
          return { ok: true, from, receivedAtto: args.value as bigint, mode: "erc20" };
        }
      } catch {
        /* not an ERC20 Transfer */
      }
    }
  }

  return { ok: false, reason: "No qualifying group-CRC transfer to the escrow found" };
}
