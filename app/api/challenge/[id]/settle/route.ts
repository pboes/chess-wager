import { NextResponse } from "next/server";
import { settleChallenge } from "@/lib/server/settle-challenge";

export const dynamic = "force-dynamic";

/**
 * POST — permissionless settlement. Anyone can trigger it; the result comes
 * from Lichess and the payout is exactly-once (see settleChallenge).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await settleChallenge(id);
  switch (r.kind) {
    case "not-found":
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    case "not-ready":
      return NextResponse.json({ error: r.reason }, { status: 409 });
    case "error":
      return NextResponse.json({ error: r.error }, { status: 500 });
    case "done":
      return NextResponse.json({ challenge: r.challenge });
  }
}
