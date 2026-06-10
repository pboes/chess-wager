import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats?token=… — usage at a glance.
 *
 * Protected by the ADMIN_TOKEN env var (set it in Vercel → Settings → Environment
 * Variables, then redeploy). Returns linked-account and challenge metrics.
 *
 * Note: the Lichess link store (`circles:lichess`) is SHARED with the daily-puzzle
 * app, so `linkedAccounts` counts everyone who connected Lichess in either app;
 * the challenge metrics are Stakemate-only.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = getStore();
  const [conns, all, leaderboard] = await Promise.all([
    store.listLichess(),
    store.listAllChallenges(),
    store.topScores(50),
  ]);

  const byStatus: Record<string, number> = {};
  const creatorCounts = new Map<string, number>();
  for (const c of all) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    creatorCounts.set(c.challenger.username, (creatorCounts.get(c.challenger.username) ?? 0) + 1);
  }
  const creators = [...creatorCounts.entries()]
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count);

  const recent = [...all]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((c) => ({
      id: c.id,
      status: c.status,
      challenger: c.challenger.username,
      target: c.targetUsername,
      opponent: c.opponent?.username ?? null,
      stakeCrc: c.stakeCrc,
      timeControl: c.timeControl.label,
      winner: c.result?.winnerUsername ?? null,
      value: c.result?.value ?? null,
      createdAt: new Date(c.createdAt).toISOString(),
    }));

  return NextResponse.json(
    {
      linkedAccounts: {
        count: conns.length,
        usernames: conns.map((c) => c.username).sort((a, b) => a.localeCompare(b)),
      },
      challenges: {
        total: all.length,
        byStatus,
        distinctCreators: creators.length,
        creators,
        recent,
      },
      leaderboard,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
