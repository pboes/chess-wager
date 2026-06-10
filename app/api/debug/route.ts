import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/**
 * Read-only diagnostics for the challenge feed. Hit with a Lichess username to
 * see how the app resolves it:
 *   GET /api/debug?username=paulboes
 * Returns the matching connection, the invites addressed to that username, and
 * the challenges the connection's wallet is indexed in — so a username/address
 * mismatch (why an Accept card doesn't show) is obvious.
 */
export async function GET(req: Request) {
  const username = new URL(req.url).searchParams.get("username")?.trim();
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const store = getStore();
  const all = await store.listLichess();
  const conn = all.find((c) => c.username.toLowerCase() === username.toLowerCase()) ?? null;

  const invites = await store.listChallengesForUsername(username);
  const byAddress = conn ? await store.listChallengesForUser(conn.address) : [];

  const summarize = (c: {
    id: string;
    status: string;
    targetUsername?: string;
    challenger: { address: string; username: string };
    opponent?: { username: string };
  }) => ({
    id: c.id,
    status: c.status,
    target: c.targetUsername,
    challenger: c.challenger.username,
    challengerAddr: c.challenger.address,
    opponent: c.opponent?.username,
  });

  return NextResponse.json(
    {
      queriedUsername: username,
      connection: conn
        ? { username: conn.username, lichessId: conn.lichessId, address: conn.address }
        : null,
      connectedUsernamesOnFile: all.map((c) => c.username),
      invitesAddressedToUsername: invites.map(summarize),
      challengesWalletIsIn: byAddress.map(summarize),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
