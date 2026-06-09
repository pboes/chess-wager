import { NextResponse } from "next/server";
import { LICHESS_HOST } from "@/lib/lichess";

export const dynamic = "force-dynamic";

/**
 * GET ?term=ma → matching Lichess usernames (any player, not just friends).
 *
 * Proxies Lichess's public autocomplete (`/api/player/autocomplete`, which needs
 * a 3+ char term) server-side so the iframe doesn't hit Lichess directly (CORS /
 * COOP). Returns `{ users: [{ name, online, title }] }`.
 */
export async function GET(req: Request) {
  const term = new URL(req.url).searchParams.get("term")?.trim() ?? "";
  if (term.length < 3) {
    return NextResponse.json({ users: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const r = await fetch(
      `${LICHESS_HOST}/api/player/autocomplete?term=${encodeURIComponent(term)}&object=true`,
      { headers: { Accept: "application/json" } }
    );
    if (!r.ok) return NextResponse.json({ users: [] });
    const d = await r.json();
    const users = (Array.isArray(d?.result) ? d.result : []).map(
      (u: { name?: string; online?: boolean; title?: string }) => ({
        name: u.name ?? "",
        online: Boolean(u.online),
        title: u.title ?? null,
      })
    );
    return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ users: [] });
  }
}
