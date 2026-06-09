import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { LICHESS_HOST } from "@/lib/lichess";

export const dynamic = "force-dynamic";

interface Friend {
  username: string;
  /** Already has a Circles wallet connected here → can accept instantly. */
  registered: boolean;
  /** Currently online on Lichess (best-effort). */
  online: boolean;
  /** In a game right now (best-effort). */
  playing: boolean;
}

/**
 * GET ?address=0x… → the caller's Lichess friends (who they follow), captured at
 * connect time, annotated with whether each is already registered here and their
 * live online/playing status from Lichess's public bulk status endpoint.
 *
 * Friends don't need a Stakemate account to be challenged — the challenge targets
 * their Lichess username and they claim it when they open the share link.
 */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address")?.toLowerCase();
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const store = getStore();
  const me = await store.getLichess(address);
  const following = me?.following ?? [];
  if (following.length === 0) {
    return NextResponse.json({ friends: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  // Which friends already have a wallet here (case-insensitive on username).
  const registered = new Set(
    (await store.listLichess()).map((c) => c.username.toLowerCase())
  );

  // Live status — public endpoint, up to 50 ids per call.
  const online = new Set<string>();
  const playing = new Set<string>();
  try {
    for (let i = 0; i < following.length; i += 50) {
      const ids = following.slice(i, i + 50).join(",");
      const r = await fetch(`${LICHESS_HOST}/api/users/status?ids=${encodeURIComponent(ids)}`);
      if (!r.ok) continue;
      const arr = (await r.json()) as Array<{ name: string; online?: boolean; playing?: boolean }>;
      for (const u of arr) {
        if (u.online) online.add(u.name.toLowerCase());
        if (u.playing) playing.add(u.name.toLowerCase());
      }
    }
  } catch {
    /* status is a nice-to-have */
  }

  const friends: Friend[] = following.map((username) => {
    const lc = username.toLowerCase();
    return {
      username,
      registered: registered.has(lc),
      online: online.has(lc),
      playing: playing.has(lc),
    };
  });

  // Sort: online first, then registered, then alphabetical.
  friends.sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      Number(b.registered) - Number(a.registered) ||
      a.username.localeCompare(b.username)
  );

  return NextResponse.json({ friends }, { headers: { "Cache-Control": "no-store" } });
}
