import { NextResponse, after } from "next/server";
import { getAddress } from "viem";
import { getStore } from "@/lib/server/store";
import { settleChallenge } from "@/lib/server/settle-challenge";

export const dynamic = "force-dynamic";

/**
 * GET ?address=0x… → all challenges involving this address, newest first.
 *
 * Also **auto-settles** in the background: after responding, any of this user's
 * `accepted` challenges whose game has finished get settled (or refunded on
 * timeout). So just opening My challenges settles finished games — the result
 * shows on the next refresh, no click needed. `settleChallenge` is idempotent.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address");
  if (!raw) return NextResponse.json({ error: "address required" }, { status: 400 });
  let address: string;
  try {
    address = getAddress(raw).toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const challenges = (await getStore().listChallengesForUser(address)).sort(
    (a, b) => b.createdAt - a.createdAt
  );

  const pending = challenges
    .filter((c) => c.status === "accepted" || c.status === "created")
    .map((c) => c.id);
  if (pending.length) {
    after(async () => {
      for (const id of pending) {
        try {
          await settleChallenge(id);
        } catch {
          /* best effort; the manual button + next load retry */
        }
      }
    });
  }

  return NextResponse.json({ challenges }, { headers: { "Cache-Control": "no-store" } });
}
