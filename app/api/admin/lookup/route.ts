import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import { gnosis } from "viem/chains";
import { getStore } from "@/lib/server/store";
import { getBalances } from "@/lib/server/circles-balances";
import { CIRCLES_RPC_URL, HUB_V2_ADDRESS } from "@/lib/circles-config";

export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });
const isHumanAbi = [
  {
    type: "function",
    name: "isHuman",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const atto = (s?: string) => (s ? Number(BigInt(s) / 10n ** 12n) / 1e6 : 0);

async function circlesProfile(address: string): Promise<{ name?: string } | null> {
  try {
    const r = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "circles_getProfileByAddress",
        params: [getAddress(address)],
      }),
    });
    const j = await r.json();
    return j?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/admin/lookup?token=…&username=helloTOMORROW
 *
 * Find a linked player and diagnose their Circles account: the bound wallet
 * address, whether it's actually a registered Circles human (mint-eligible), its
 * Circles profile name (what the Circles people-search matches on), and Crowns.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.ADMIN_TOKEN || url.searchParams.get("token") !== process.env.ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = url.searchParams.get("username")?.trim();
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const conns = await getStore().listLichess();
  const conn = conns.find((c) => c.username.toLowerCase() === username.toLowerCase());
  if (!conn) {
    const similar = conns
      .map((c) => c.username)
      .filter((u) => u.toLowerCase().includes(username.toLowerCase()));
    return NextResponse.json({ found: false, queried: username, similarUsernames: similar });
  }

  const [balances, isHuman, profile] = await Promise.all([
    getBalances(conn.address),
    client
      .readContract({ address: HUB_V2_ADDRESS, abi: isHumanAbi, functionName: "isHuman", args: [getAddress(conn.address)] })
      .catch(() => false),
    circlesProfile(conn.address),
  ]);

  return NextResponse.json(
    {
      found: true,
      connection: {
        username: conn.username,
        lichessId: conn.lichessId,
        address: conn.address,
        sigVerified: conn.sigVerified,
        connectedAt: new Date(conn.connectedAt).toISOString(),
      },
      circles: {
        isHumanRegistered: isHuman,
        profileName: profile?.name ?? null,
        crownsAvailable: Math.floor(atto(balances.heldPersonalAtto) + atto(balances.mintableAtto)),
        heldPersonalCrc: atto(balances.heldPersonalAtto),
        mintableCrc: atto(balances.mintableAtto),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
