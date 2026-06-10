import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { randomString, type LichessHandoff } from "@/lib/lichess";

export const dynamic = "force-dynamic";

/**
 * Lichess-first onboarding: start an **address-less** handoff. There's no wallet
 * yet, so we just mint a session token; the OAuth callback captures the Lichess
 * identity onto it, and `/api/lichess/bind` attaches the wallet once it's created.
 */
export async function POST() {
  const handoff: LichessHandoff = {
    token: randomString(18),
    sigVerified: false,
    status: "pending",
    createdAt: Date.now(),
  };
  await getStore().setHandoff(handoff);
  return NextResponse.json({ token: handoff.token });
}
