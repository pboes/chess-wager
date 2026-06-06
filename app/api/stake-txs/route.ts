import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { ESCROW_ADDRESS } from "@/lib/circles-config";
import { crcToAtto } from "@/lib/challenge/accounting";
import { buildStakeTransferTxs } from "@/lib/stake-transfer";
import { buildPersonalStakeTxs } from "@/lib/server/personal-stake";
import { getPermissionlessGroup } from "@/lib/permissionless-group";

export const dynamic = "force-dynamic";

/**
 * POST { address, mode, stakeCrc } → the tx batch to stake into the escrow,
 * which the client signs via the host.
 *
 *  - "personal": direct ERC1155 transfer of the player's own CRC.
 *  - "group":    gCRC transfer (no migration — you must already hold gCRC; if
 *                short, the UI sends you to the Circles app).
 */
export async function POST(req: Request) {
  let b: { address?: string; mode?: string; stakeCrc?: number };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { address, mode, stakeCrc } = b;
  if (!address || !stakeCrc || !mode) {
    return NextResponse.json({ error: "address, mode and stakeCrc are required" }, { status: 400 });
  }
  let addr: `0x${string}`;
  try {
    addr = getAddress(address);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const amountAtto = crcToAtto(stakeCrc);
  try {
    const txs =
      mode === "personal"
        ? await buildPersonalStakeTxs(addr, ESCROW_ADDRESS, amountAtto)
        : await buildStakeTransferTxs(getPermissionlessGroup(), addr, ESCROW_ADDRESS, amountAtto);
    return NextResponse.json({ txs });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't build the stake transaction" },
      { status: 500 }
    );
  }
}
