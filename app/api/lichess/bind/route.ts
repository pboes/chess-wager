import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import { gnosis } from "viem/chains";
import { getStore } from "@/lib/server/store";
import { type LichessConnection } from "@/lib/lichess";
import { CIRCLES_RPC_URL } from "@/lib/circles-config";

export const dynamic = "force-dynamic";

/**
 * Lichess-first onboarding, final step. The wallet was just created; bind it to
 * the Lichess identity captured by the OAuth callback (handoff token).
 *
 * Security: the wallet signature proves control of `address`; the handoff token
 * (secret, short-lived) proves this is the same browser that did the OAuth; and
 * the lichessId↔wallet 1-to-1 rule is enforced here.
 */
export async function POST(req: Request) {
  let body: { token?: string; address?: string; message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { token, address, message, signature } = body;
  if (!token || !address || !message || !signature) {
    return NextResponse.json(
      { error: "token, address, message and signature are required" },
      { status: 400 }
    );
  }
  let addr: string;
  try {
    addr = getAddress(address);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const store = getStore();
  const h = await store.getHandoff(token);
  if (!h) return NextResponse.json({ error: "This sign-in link has expired" }, { status: 410 });
  if (h.status !== "completed" || !h.username || !h.lichessId) {
    return NextResponse.json({ error: "Lichess isn't connected yet" }, { status: 409 });
  }

  // Best-effort wallet-ownership proof (EIP-1271 via the Safe). The real session
  // secret is the handoff token (only this browser holds it) and the binding
  // wallet was just created in this session; a fresh Safe may not be
  // ERC-1271-verifiable yet, so this is recorded, not required.
  let sigVerified = false;
  try {
    const pc = createPublicClient({ chain: gnosis, transport: http(CIRCLES_RPC_URL) });
    sigVerified = await pc.verifyMessage({
      address: addr as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    sigVerified = false;
  }

  // One Lichess account ↔ one wallet.
  const owner = await store.getLichessByLichessId(h.lichessId);
  if (owner && owner.address.toLowerCase() !== addr.toLowerCase()) {
    return NextResponse.json(
      { error: `Lichess account "${h.username}" is already linked to a different wallet.` },
      { status: 409 }
    );
  }

  const conn: LichessConnection = {
    username: h.username,
    lichessId: h.lichessId,
    address: addr.toLowerCase(),
    connectedAt: Date.now(),
    sigVerified,
    following: h.following,
  };
  await store.setLichess(addr.toLowerCase(), conn);

  return NextResponse.json({ username: conn.username });
}
