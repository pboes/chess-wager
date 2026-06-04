import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** GET ?address=0x… → all challenges involving this address, newest first. */
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
  return NextResponse.json({ challenges }, { headers: { "Cache-Control": "no-store" } });
}
