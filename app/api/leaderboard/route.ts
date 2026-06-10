import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

interface Row {
  username: string;
  score: number;
  rank: number;
  isMe: boolean;
}

/**
 * GET ?address=0x…&scope=global|friends → the leaderboard.
 *  - global: top scorers overall.
 *  - friends: the caller + the Lichess friends they follow, ranked among
 *    themselves.
 * Score = all-time sum of token values a player has won (opponent ratings).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address")?.toLowerCase();
  const scope = url.searchParams.get("scope") === "friends" ? "friends" : "global";

  const store = getStore();
  const me = address ? await store.getLichess(address) : null;
  const myName = me?.username ?? null;

  let rows: Row[];
  if (scope === "friends") {
    const names = Array.from(new Set([...(me?.following ?? []), ...(myName ? [myName] : [])]));
    const scores = await store.scoresFor(names);
    rows = names
      .map((username) => ({ username, score: scores[username] ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1, isMe: r.username === myName }));
  } else {
    rows = (await store.topScores(50)).map((r, i) => ({
      ...r,
      rank: i + 1,
      isMe: r.username === myName,
    }));
  }

  return NextResponse.json(
    { scope, rows, me: myName },
    { headers: { "Cache-Control": "no-store" } }
  );
}
