import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** GET ?exclude=0x… → connected players you can challenge (address + username). */
export async function GET(req: Request) {
  const exclude = new URL(req.url).searchParams.get("exclude")?.toLowerCase();
  const conns = await getStore().listLichess();
  const users = conns
    .filter((c) => c.address.toLowerCase() !== exclude)
    .map((c) => ({ address: c.address, username: c.username }));
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
