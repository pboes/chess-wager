import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getStore } from "@/lib/server/store";
import { verifyStakePayment } from "@/lib/server/verify-stake";
import { crcToAtto, toStatic } from "@/lib/challenge/accounting";
import { ACCEPT_WINDOW_MS } from "@/lib/challenge/state";
import {
  GROUP_TOKEN,
  stakeTokenId,
  timeControlByKey,
  type Challenge,
  type ChallengeMode,
} from "@/lib/challenge/types";
import { MIN_STAKE_CRC } from "@/lib/circles-config";
import { lichessUserExists, randomString } from "@/lib/lichess";

export const dynamic = "force-dynamic";

/**
 * POST { challengerAddress, targetUsername, timeControlKey, stakeCrc, mode, txHash }
 *
 * The challenger has already staked into the escrow (txHash). We verify the
 * stake and open an invite addressed to a **Lichess username** — the opponent
 * doesn't need an account yet; they claim it by connecting that account when
 * they open the share link. The challenge is indexed under the target username
 * so a registered friend also sees it in-app without the link.
 */
export async function POST(req: Request) {
  let b: {
    challengerAddress?: string;
    targetUsername?: string;
    timeControlKey?: string;
    stakeCrc?: number;
    txHash?: string;
    mode?: ChallengeMode;
  };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { challengerAddress, timeControlKey, stakeCrc, txHash } = b;
  const targetUsername = b.targetUsername?.trim();
  const mode: ChallengeMode = b.mode === "personal" ? "personal" : "group";
  if (!challengerAddress || !targetUsername || !timeControlKey || !stakeCrc || !txHash) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let challenger: string;
  try {
    challenger = getAddress(challengerAddress).toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (stakeCrc < MIN_STAKE_CRC) {
    return NextResponse.json({ error: `Minimum stake is ${MIN_STAKE_CRC} CRC` }, { status: 400 });
  }
  const tc = timeControlByKey(timeControlKey);
  if (!tc) return NextResponse.json({ error: "Unknown time control" }, { status: 400 });

  const store = getStore();
  const challengerConn = await store.getLichess(challenger);
  if (!challengerConn) {
    return NextResponse.json({ error: "Connect your Lichess account first" }, { status: 400 });
  }
  if (targetUsername.toLowerCase() === challengerConn.username.toLowerCase()) {
    return NextResponse.json({ error: "You can't challenge yourself" }, { status: 400 });
  }
  // Make sure the invited name is a real Lichess account, so the link can't be
  // sent to a username that can never accept.
  if (!(await lichessUserExists(targetUsername))) {
    return NextResponse.json(
      { error: `No Lichess player named "${targetUsername}"` },
      { status: 404 }
    );
  }

  if (await store.isTxUsed(txHash)) {
    return NextResponse.json({ error: "This stake transaction was already used" }, { status: 409 });
  }

  const stakeAtto = crcToAtto(stakeCrc);
  const verified = await verifyStakePayment(
    txHash,
    stakeAtto,
    challenger,
    stakeTokenId(mode, challenger)
  );
  if (!verified.ok || !verified.receivedAtto) {
    return NextResponse.json({ error: verified.reason ?? "Stake not verified" }, { status: 402 });
  }
  await store.markTxUsed(txHash);

  const now = Date.now();
  const challenge: Challenge = {
    id: randomString(12),
    status: "created",
    mode,
    token: mode === "group" ? GROUP_TOKEN : { kind: "personal", address: challenger },
    timeControl: tc,
    stakeStaticAtto: toStatic(stakeAtto).toString(),
    stakeCrc,
    challenger: { address: challenger, username: challengerConn.username },
    targetUsername,
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
