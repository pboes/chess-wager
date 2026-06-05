import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/** GET ?token=… → the handoff's current status (polled by the miniapp). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const h = await getStore().getHandoff(token);
  if (!h) return NextResponse.json({ status: "expired" }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(
    { status: h.status, username: h.username ?? null, error: h.error ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
