import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import { gnosis } from "viem/chains";
import { getStore } from "@/lib/server/store";
import { randomString, type LichessHandoff } from "@/lib/lichess";
import { CIRCLES_RPC_URL } from "@/lib/circles-config";

export const dynamic = "force-dynamic";

/**
 * Circles side of the handshake: the miniapp signed `message` with the wallet.
 * Verify it (EIP-1271 via the Safe), store a short-lived handoff, and return its
 * token. The user then opens the OAuth tab carrying this token.
 */
export async function POST(req: Request) {
  let body: { address?: string; message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { address, message, signature } = body;
  if (!address || !message || !signature) {
    return NextResponse.json(
      { error: "address, message and signature are required" },
      { status: 400 }
    );
  }
  let addr: string;
  try {
    addr = getAddress(address);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

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
  if (!sigVerified) {
    return NextResponse.json({ error: "Wallet signature could not be verified" }, { status: 401 });
  }

  const handoff: LichessHandoff = {
    token: randomString(18),
    address: addr.toLowerCase(),
    message,
    signature,
    sigVerified,
    status: "pending",
    createdAt: Date.now(),
  };
  await getStore().setHandoff(handoff);

  return NextResponse.json({ token: handoff.token });
}
