import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { fetchGameResult } from "@/lib/lichess-game";
import { computePayoutAtto } from "@/lib/challenge/accounting";
import { escrowPay } from "@/lib/server/escrow-payout";
import type { Challenge, ChallengeResult, Transfer } from "@/lib/challenge/types";

export const dynamic = "force-dynamic";

const eq = (a?: string, b?: string) =>
  Boolean(a) && Boolean(b) && a!.toLowerCase() === b!.toLowerCase();

/** Refund each staker the current value of their own stake. */
async function refundBoth(c: Challenge): Promise<Transfer[]> {
  const refunds: Transfer[] = [];
  for (const s of [c.stakes.challenger, c.stakes.opponent]) {
    if (!s) continue;
    const amount = computePayoutAtto(BigInt(s.staticAtto));
    if (amount <= 0n) continue;
    const r = await escrowPay(s.address, amount);
    refunds.push({ txHash: r.txHash, amountAtto: r.amountAtto, to: r.to });
  }
  return refunds;
}

/**
 * POST — permissionless settlement. Anyone can trigger it; the result comes
 * from Lichess and `claimSettle` (SET NX) makes the payout exactly-once.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = getStore();
  const c = await store.getChallenge(id);
  if (!c) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

  const now = Date.now();

  // Already finished.
  if (c.status === "settled" || c.status === "void" || c.status === "expired") {
    return NextResponse.json({ challenge: c });
  }

  // Opponent never accepted → refund the challenger once the window lapses.
  if (c.status === "created") {
    if (now <= c.expiresAt) {
      return NextResponse.json({ error: "Still waiting for the opponent to accept" }, { status: 409 });
    }
    if (!(await store.claimSettle(id))) {
      return NextResponse.json({ challenge: await store.getChallenge(id) });
    }
    try {
      c.refunds = await refundBoth(c); // only the challenger has staked here
      c.status = "expired";
      c.settledAt = now;
      await store.saveChallenge(c);
    } catch (err) {
      await store.unclaimSettle(id);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Refund failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ challenge: c });
  }

  // c.status === "accepted": read the authoritative Lichess result.
  if (!c.lichess) {
    return NextResponse.json({ error: "No Lichess game on this challenge" }, { status: 500 });
  }
  let game;
  try {
    game = await fetchGameResult(c.lichess.gameId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't read the Lichess game" },
      { status: 502 }
    );
  }

  // Not finished yet → void+refund only if the play window lapsed.
  if (!game.finished) {
    if (now <= c.expiresAt) {
      return NextResponse.json({ error: "The game hasn't finished yet" }, { status: 409 });
    }
    if (!(await store.claimSettle(id))) {
      return NextResponse.json({ challenge: await store.getChallenge(id) });
    }
    try {
      c.result = { status: game.status || "unplayed", outcome: "void" };
      c.refunds = await refundBoth(c);
      c.status = "void";
      c.settledAt = now;
      await store.saveChallenge(c);
    } catch (err) {
      await store.unclaimSettle(id);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Refund failed" },
        { status: 500 }
      );
    }
    return NextResponse.json({ challenge: c });
  }

  // Finished. Decide the outcome, then pay exactly once.
  if (!(await store.claimSettle(id))) {
    return NextResponse.json({ challenge: await store.getChallenge(id) });
  }
  try {
    // The two players must be exactly our two connected accounts (no ringers).
    const playersMatch =
      eq(game.white, c.challenger.username) && eq(game.black, c.opponent.username);

    let result: ChallengeResult;
    if (game.winner && playersMatch) {
      const winnerAddress =
        game.winner === "white" ? c.lichess.whiteAddress : c.lichess.blackAddress;
      const winnerUsername = game.winner === "white" ? game.white : game.black;
      result = {
        status: game.status,
        winnerColor: game.winner,
        winnerUsername,
        winnerAddress,
        outcome: "win",
      };
    } else {
      // Draw, abort, or a username mismatch → void & refund both.
      result = {
        status: game.status,
        outcome: playersMatch ? "draw" : "void",
      };
    }
    c.result = result;

    if (result.outcome === "win" && result.winnerAddress) {
      const sc = c.stakes.challenger?.staticAtto ?? "0";
      const so = c.stakes.opponent?.staticAtto ?? "0";
      const amount = computePayoutAtto(BigInt(sc), BigInt(so));
      const r = await escrowPay(result.winnerAddress, amount);
      c.payout = { txHash: r.txHash, amountAtto: r.amountAtto, to: r.to };
      c.status = "settled";
    } else {
      c.refunds = await refundBoth(c);
      c.status = "void";
    }
    c.settledAt = now;
    await store.markGameUsed(c.lichess.gameId);
    await store.saveChallenge(c);
  } catch (err) {
    await store.unclaimSettle(id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Settlement failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ challenge: c });
}
