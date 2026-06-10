import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import {
  fetchFollowing,
  LICHESS_CLIENT_ID,
  LICHESS_HOST,
  type LichessConnection,
} from "@/lib/lichess";

export const dynamic = "force-dynamic";

/**
 * GET ?code=…&state=token — Lichess redirects here in the top-level tab. Exchange
 * the code server-side (PKCE verifier from the handoff), identify the account,
 * enforce one-Lichess-↔-one-wallet, store the link, mark the handoff done, and
 * send the tab to the finalize page. The miniapp is polling and will react.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const oauthErr = url.searchParams.get("error");
  const origin = `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("host")}`;
  const finalize = `${origin}/lichess/finalize?token=${token}`;

  const store = getStore();
  const h = token ? await store.getHandoff(token) : null;
  if (!h) {
    return NextResponse.redirect(`${origin}/lichess/finalize?token=${token}&e=expired`);
  }

  const fail = async (error: string) => {
    h.status = "failed";
    h.error = error;
    await store.setHandoff(h);
    return NextResponse.redirect(finalize);
  };

  if (oauthErr || !code) return fail("Authorization was cancelled on Lichess.");
  if (!h.codeVerifier || !h.redirectUri) return fail("Sign-in session was incomplete — please retry.");

  // Exchange the code (PKCE) — server-side, the token never reaches the client.
  const tokenRes = await fetch(`${LICHESS_HOST}/api/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: h.codeVerifier,
      redirect_uri: h.redirectUri,
      client_id: LICHESS_CLIENT_ID,
    }),
  });
  if (!tokenRes.ok) return fail("Lichess token exchange failed.");
  const accessToken = (await tokenRes.json())?.access_token as string | undefined;
  if (!accessToken) return fail("No access token from Lichess.");

  const accRes = await fetch(`${LICHESS_HOST}/api/account`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const acc = accRes.ok ? await accRes.json() : null;
  const username: string | undefined = acc?.username;
  const lichessId: string | undefined = acc?.id;

  // Capture the player's Lichess friends (who they follow) while we hold the
  // token, so we can offer them as challenge targets. Best-effort.
  const following = await fetchFollowing(accessToken);

  // We needed identity + the follow list — revoke the token now.
  try {
    await fetch(`${LICHESS_HOST}/api/token`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* best effort */
  }

  if (!username || !lichessId) return fail("Could not read your Lichess account.");

  // Wallet-first flow: the wallet is already known, so enforce 1-to-1 and write
  // the connection now. Lichess-first flow (no address yet): just capture the
  // identity onto the handoff; /api/lichess/bind writes it once the wallet exists.
  if (h.address) {
    const owner = await store.getLichessByLichessId(lichessId);
    if (owner && owner.address.toLowerCase() !== h.address.toLowerCase()) {
      return fail(
        `Lichess account "${username}" is already linked to a different Circles wallet (${owner.address}).`
      );
    }
    const conn: LichessConnection = {
      username,
      lichessId,
      address: h.address,
      connectedAt: Date.now(),
      sigVerified: h.sigVerified,
      following,
    };
    await store.setLichess(h.address, conn);
  }

  h.status = "completed";
  h.username = username;
  h.lichessId = lichessId;
  h.following = following;
  await store.setHandoff(h);

  return NextResponse.redirect(finalize);
}
