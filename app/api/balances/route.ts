import { NextResponse } from "next/server";
import { getAddress } from "viem";
import { getBalances } from "@/lib/server/circles-balances";

export const dynamic = "force-dynamic";

/** GET ?address=0x… → held personal CRC, held group CRC, mintable personal CRC. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address");
  if (!raw) return NextResponse.json({ error: "address required" }, { status: 400 });
  let address: string;
  try {
    address = getAddress(raw);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const balances = await getBalances(address);
  return NextResponse.json(balances, { headers: { "Cache-Control": "no-store" } });
}
