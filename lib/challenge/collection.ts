/**
 * The "collection" — derived purely from settled challenges, so it's always
 * consistent with what actually happened (no separate counter to drift).
 *
 * "Collected" = the count of other players' coins you've won: each settled win
 * collects the loser's stake. Rivals aggregates that per opponent with a
 * head-to-head record — the centerpiece of the game.
 */
import type { Challenge } from "@/lib/challenge/types";

export interface RivalStat {
  username: string;
  wins: number; // games you won vs them
  losses: number; // games you lost to them
  collected: number; // their coins you hold (sum of stakes you won off them)
  lost: number; // your coins they hold
}

export interface Collection {
  /** Total coins collected off others (sum of stakes won). */
  collected: number;
  /** Distinct players you've taken coins from. */
  players: number;
  rivals: RivalStat[];
}

const lc = (s?: string) => (s ?? "").toLowerCase();

/** Who the other player is on a challenge, from `me`'s perspective. */
export function opponentName(c: Challenge, myAddress: string): string {
  const mine = lc(c.challenger.address) === lc(myAddress);
  return mine ? c.opponent?.username ?? c.targetUsername : c.challenger.username;
}

export function computeCollection(challenges: Challenge[], myAddress: string): Collection {
  const me = lc(myAddress);
  const byRival = new Map<string, RivalStat>();
  const get = (username: string): RivalStat => {
    const key = lc(username);
    let r = byRival.get(key);
    if (!r) {
      r = { username, wins: 0, losses: 0, collected: 0, lost: 0 };
      byRival.set(key, r);
    }
    return r;
  };

  for (const c of challenges) {
    if (c.status !== "settled" || c.result?.outcome !== "win") continue;
    const them = opponentName(c, myAddress);
    const r = get(them);
    const iWon = lc(c.result.winnerAddress) === me;
    if (iWon) {
      r.wins += 1;
      r.collected += c.stakeCrc;
    } else {
      r.losses += 1;
      r.lost += c.stakeCrc;
    }
  }

  const rivals = [...byRival.values()].sort(
    (a, b) => b.collected - a.collected || b.wins - a.wins || a.username.localeCompare(b.username)
  );
  const collected = rivals.reduce((sum, r) => sum + r.collected, 0);
  const players = rivals.filter((r) => r.collected > 0).length;
  return { collected, players, rivals };
}
