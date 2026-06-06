/**
 * Core settlement, shared by the manual `POST /settle` and the background
 * auto-settle. Permissionless + idempotent: the result comes from Lichess and
 * `claimSettle` (SET NX) makes the payout/refund exactly-once.
 */
import { getStore } from "@/lib/server/store";
import { fetchGameResult } from "@/lib/lichess-game";
import { computePayoutAtto } from "@/lib/challenge/accounting";
import { escrowPay, escrowTransferToken } from "@/lib/server/escrow-payout";
import { stakeTokenId } from "@/lib/challenge/types";
import type { Challenge, ChallengeResult, Transfer } from "@/lib/challenge/types";

const eq = (a?: string, b?: string) =>
  Boolean(a) && Boolean(b) && a!.toLowerCase() === b!.toLowerCase();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Pay `amount` of a player's stake currency to `recipient`.
 *  - group:    pooled gCRC via transferGroupCrc.
 *  - personal: direct transfer of *that player's own* token (the trophy).
 */
async function payStake(
  c: Challenge,
  stakerAddress: string,
  amount: bigint,
  recipient: string
): Promise<Transfer> {
  const mode = c.mode ?? "group";
  const r =
    mode === "group"
      ? await escrowPay(recipient, amount)
      : await escrowTransferToken(stakeTokenId("personal", stakerAddress), recipient, amount);
  return { txHash: r.txHash, amountAtto: r.amountAtto, to: r.to };
}

async function refundBoth(c: Challenge): Promise<Transfer[]> {
  const refunds: Transfer[] = [];
  for (const s of [c.stakes.challenger, c.stakes.opponent]) {
    if (!s) continue;
    const amount = computePayoutAtto(BigInt(s.staticAtto));
    if (amount <= 0n) continue;
    refunds.push(await payStake(c, s.address, amount, s.address));
  }
  return refunds;
}

export type SettleOutcome =
  | { kind: "not-found" }
  | { kind: "not-ready"; reason: string }
  | { kind: "done"; challenge: Challenge }
  | { kind: "error"; error: string };

export async function settleChallenge(id: string): Promise<SettleOutcome> {
  const store = getStore();
  const c = await store.getChallenge(id);
  if (!c) return { kind: "not-found" };
  const now = Date.now();

  if (c.status === "settled" || c.status === "void" || c.status === "expired") {
    return { kind: "done", challenge: c };
  }

  // Opponent never accepted → refund the challenger once the window lapses.
  if (c.status === "created") {
    if (now <= c.expiresAt) {
      return { kind: "not-ready", reason: "Still waiting for the opponent to accept" };
    }
    if (!(await store.claimSettle(id))) {
      return { kind: "done", challenge: (await store.getChallenge(id))! };
    }
    try {
      c.refunds = await refundBoth(c);
      c.status = "expired";
      c.settledAt = now;
      await store.saveChallenge(c);
      return { kind: "done", challenge: c };
    } catch (e) {
      await store.unclaimSettle(id);
      return { kind: "error", error: msg(e) };
    }
  }

  // accepted → read the authoritative Lichess result.
  if (!c.lichess) return { kind: "error", error: "No Lichess game on this challenge" };
  let game;
  try {
    game = await fetchGameResult(c.lichess.gameId);
  } catch (e) {
    return { kind: "not-ready", reason: `Couldn't read the Lichess game: ${msg(e)}` };
  }

  if (!game.finished) {
    if (now <= c.expiresAt) return { kind: "not-ready", reason: "The game hasn't finished yet" };
    if (!(await store.claimSettle(id))) {
      return { kind: "done", challenge: (await store.getChallenge(id))! };
    }
    try {
      c.result = { status: game.status || "unplayed", outcome: "void" };
      c.refunds = await refundBoth(c);
      c.status = "void";
      c.settledAt = now;
      await store.saveChallenge(c);
      return { kind: "done", challenge: c };
    } catch (e) {
      await store.unclaimSettle(id);
      return { kind: "error", error: msg(e) };
    }
  }

  if (!(await store.claimSettle(id))) {
    return { kind: "done", challenge: (await store.getChallenge(id))! };
  }
  try {
    const playersMatch =
      eq(game.white, c.challenger.username) && eq(game.black, c.opponent.username);

    let result: ChallengeResult;
    if (game.winner && playersMatch) {
      const winnerAddress =
        game.winner === "white" ? c.lichess.whiteAddress : c.lichess.blackAddress;
      result = {
        status: game.status,
        winnerColor: game.winner,
        winnerUsername: game.winner === "white" ? game.white : game.black,
        winnerAddress,
        outcome: "win",
      };
    } else {
      result = { status: game.status, outcome: playersMatch ? "draw" : "void" };
    }
    c.result = result;

    if (result.outcome === "win" && result.winnerAddress) {
      const mode = c.mode ?? "group";
      if (mode === "group") {
        // Pooled fungible pot → one transfer of the summed value.
        const sc = c.stakes.challenger?.staticAtto ?? "0";
        const so = c.stakes.opponent?.staticAtto ?? "0";
        const amount = computePayoutAtto(BigInt(sc), BigInt(so));
        c.payouts = [await payStake(c, result.winnerAddress, amount, result.winnerAddress)];
      } else {
        // Personal → winner takes each player's own token (the trophy).
        const payouts: Transfer[] = [];
        for (const s of [c.stakes.challenger, c.stakes.opponent]) {
          if (!s) continue;
          const amount = computePayoutAtto(BigInt(s.staticAtto));
          payouts.push(await payStake(c, s.address, amount, result.winnerAddress));
        }
        c.payouts = payouts;
      }
      c.status = "settled";
    } else {
      c.refunds = await refundBoth(c);
      c.status = "void";
    }
    c.settledAt = now;
    await store.markGameUsed(c.lichess.gameId);
    await store.saveChallenge(c);
    return { kind: "done", challenge: c };
  } catch (e) {
    await store.unclaimSettle(id);
    return { kind: "error", error: msg(e) };
  }
}
