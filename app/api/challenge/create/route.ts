import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getStore } from "@/lib/server/store";
import { verifyStakePayment } from "@/lib/server/verify-stake";
import { crcToAtto, toStatic } from "@/lib/challenge/accounting";
import { ACCEPT_WINDOW_MS } from "@/lib/challenge/state";
import { GROUP_TOKEN, timeControlByKey, type Challenge } from "@/lib/challenge/types";
import { MIN_STAKE_CRC } from "@/lib/circles-config";
import { randomString } from "@/lib/lichess";

export const dynamic = "force-dynamic";

/**
 * POST { challengerAddress, opponentAddress, timeControlKey, stakeCrc, txHash }
 * The challenger has already staked into the escrow (txHash). We verify it,
 * confirm both players are connected, and open the challenge.
 */
export async function POST(req: Request) {
  let b: {
    challengerAddress?: string;
    opponentAddress?: string;
    timeControlKey?: string;
    stakeCrc?: number;
    txHash?: string;
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { challengerAddress, opponentAddress, timeControlKey, stakeCrc, txHash } = b;
  if (!challengerAddress || !opponentAddress || !timeControlKey || !stakeCrc || !txHash) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let challenger: string, opponent: string;
  try {
    challenger = getAddress(challengerAddress).toLowerCase();
    opponent = getAddress(opponentAddress).toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (challenger === opponent) {
    return NextResponse.json({ error: "You can't challenge yourself" }, { status: 400 });
  }
  if (stakeCrc < MIN_STAKE_CRC) {
    return NextResponse.json({ error: `Minimum stake is ${MIN_STAKE_CRC} gCRC` }, { status: 400 });
  }
  const tc = timeControlByKey(timeControlKey);
  if (!tc) return NextResponse.json({ error: "Unknown time control" }, { status: 400 });

  const store = getStore();
  const [challengerConn, opponentConn] = await Promise.all([
    store.getLichess(challenger),
    store.getLichess(opponent),
  ]);
  if (!challengerConn) {
    return NextResponse.json({ error: "Connect your Lichess account first" }, { status: 400 });
  }
  if (!opponentConn) {
    return NextResponse.json({ error: "That player hasn't connected Lichess" }, { status: 400 });
  }

  if (await store.isTxUsed(txHash)) {
    return NextResponse.json({ error: "This stake transaction was already used" }, { status: 409 });
  }

  const stakeAtto = crcToAtto(stakeCrc);
  const verified = await verifyStakePayment(txHash, stakeAtto, challenger);
  if (!verified.ok || !verified.receivedAtto) {
    return NextResponse.json({ error: verified.reason ?? "Stake not verified" }, { status: 402 });
  }
  await store.markTxUsed(txHash);

  const now = Date.now();
  const challenge: Challenge = {
    id: randomString(12),
    status: "created",
    token: GROUP_TOKEN,
    timeControl: tc,
    stakeStaticAtto: toStatic(stakeAtto).toString(),
    stakeCrc,
    challenger: { address: challenger, username: challengerConn.username },
    opponent: { address: opponent, username: opponentConn.username },
    stakes: {
      challenger: {
        address: challenger,
        txHash,
        staticAtto: toStatic(verified.receivedAtto).toString(),
        at: now,
      },
    },
    createdAt: now,
    expiresAt: now + ACCEPT_WINDOW_MS,
  };
  await store.createChallenge(challenge);

  return NextResponse.json({ challenge });
}
