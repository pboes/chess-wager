import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getStore } from "@/lib/server/store";
import { verifyStakePayment } from "@/lib/server/verify-stake";
import { toDemurrageNow, toStatic } from "@/lib/challenge/accounting";
import { PLAY_WINDOW_MS } from "@/lib/challenge/state";
import { createOpenChallenge } from "@/lib/lichess-game";
import { stakeTokenId } from "@/lib/challenge/types";

export const dynamic = "force-dynamic";

/**
 * POST { opponentAddress, txHash } — the challenged player has staked. Verify
 * it, create the Lichess game (open challenge restricted to the two usernames),
 * and move the challenge to `accepted`. Challenger plays white, opponent black.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let b: { opponentAddress?: string; txHash?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!b.opponentAddress || !b.txHash) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  let opponent: string;
  try {
    opponent = getAddress(b.opponentAddress).toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const store = getStore();
  const c = await store.getChallenge(id);
  if (!c) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  if (c.status !== "created") {
    return NextResponse.json({ error: `Challenge is ${c.status}` }, { status: 409 });
  }
  if (Date.now() > c.expiresAt) {
    return NextResponse.json({ error: "This challenge has expired" }, { status: 410 });
  }
  if (c.opponent.address !== opponent) {
    return NextResponse.json({ error: "This challenge isn't addressed to you" }, { status: 403 });
  }
  if (await store.isTxUsed(b.txHash)) {
    return NextResponse.json({ error: "This stake transaction was already used" }, { status: 409 });
  }

  // Opponent must match the agreed stake (its current demurraged value), staked
  // in the right token (their own personal CRC, or gCRC).
  const mode = c.mode ?? "group";
  const needAtto = toDemurrageNow(BigInt(c.stakeStaticAtto));
  const verified = await verifyStakePayment(
    b.txHash,
    needAtto,
    opponent,
    stakeTokenId(mode, opponent)
  );
  if (!verified.ok || !verified.receivedAtto) {
    return NextResponse.json({ error: verified.reason ?? "Stake not verified" }, { status: 402 });
  }
  await store.markTxUsed(b.txHash);

  // Create the bound Lichess game.
  let game;
  try {
    game = await createOpenChallenge(c.timeControl, [
      c.challenger.username,
      c.opponent.username,
    ]);
  } catch (err) {
    // Stake is in escrow but we couldn't make the game — record opponent stake
    // and leave as created so a retry/refund path can handle it.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lichess game creation failed" },
      { status: 502 }
    );
  }

  const now = Date.now();
  c.status = "accepted";
  c.acceptedAt = now;
  c.expiresAt = now + PLAY_WINDOW_MS;
  c.stakes.opponent = {
    address: opponent,
    txHash: b.txHash,
    staticAtto: toStatic(verified.receivedAtto).toString(),
    at: now,
  };
  c.lichess = {
    gameId: game.gameId,
    urlWhite: game.urlWhite,
    urlBlack: game.urlBlack,
    whiteAddress: c.challenger.address,
    blackAddress: c.opponent.address,
  };
  await store.saveChallenge(c);

  return NextResponse.json({ challenge: c });
}
