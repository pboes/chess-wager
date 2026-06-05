import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/store";
import { buildAuthorizeUrl, pkceChallenge, randomString } from "@/lib/lichess";

export const dynamic = "force-dynamic";

/**
 * GET ?token=… — runs in the top-level OAuth tab. Generates the PKCE verifier,
 * stashes it on the handoff, and redirects to Lichess. The token rides as the
 * OAuth `state` so the callback can find the handoff.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const store = getStore();
  const h = await store.getHandoff(token);
  if (!h) {
    return NextResponse.json({ error: "This sign-in link has expired" }, { status: 410 });
  }
  if (h.status === "completed") {
    const origin = originOf(req);
    return NextResponse.redirect(`${origin}/lichess/finalize?token=${token}`);
  }

  const origin = originOf(req);
  const redirectUri = `${origin}/api/lichess/oauth/callback`;
  const verifier = randomString(32);
  const challenge = await pkceChallenge(verifier);

  h.codeVerifier = verifier;
  h.redirectUri = redirectUri;
  await store.setHandoff(h);

  const authUrl = buildAuthorizeUrl({ challenge, state: token, redirectUri });
  return NextResponse.redirect(authUrl);
}

function originOf(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host");
  return `${proto}://${host}`;
}
