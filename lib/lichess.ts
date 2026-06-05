/**
 * Lichess OAuth2 (Authorization Code + PKCE) config + helpers.
 *
 * Lichess is a public client: no app registration, no client secret — you pick
 * an arbitrary `client_id` and the only accepted challenge method is S256.
 * Authorize at `${host}/oauth`, exchange at `${host}/api/token`, identify via
 * `${host}/api/account`.
 *
 * The consent can't run in a popup inside the Circles host: the miniapp is in a
 * sandboxed iframe, so a popup it opens inherits the sandbox, and Chrome blocks
 * a sandboxed popup from loading lichess.org's COOP page
 * (ERR_BLOCKED_BY_RESPONSE). Instead we use a **handoff**: sign in the iframe,
 * store a token, then the user opens a real top-level tab (link or copy-paste)
 * where redirect-based OAuth runs server-side. The token rides in the `state`.
 */
export const LICHESS_HOST = "https://lichess.org";
export const LICHESS_CLIENT_ID = "daily-chess-duel";
/** Empty scope = identify only (read the public account/username). */
export const LICHESS_SCOPES: string[] = [];

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomString(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return base64url(a);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function buildAuthorizeUrl(opts: {
  challenge: string;
  state: string;
  redirectUri: string;
}): string {
  const u = new URL(`${LICHESS_HOST}/oauth`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", LICHESS_CLIENT_ID);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  if (LICHESS_SCOPES.length) u.searchParams.set("scope", LICHESS_SCOPES.join(" "));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("code_challenge", opts.challenge);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

export interface LichessConnection {
  username: string;
  lichessId: string;
  address: string;
  connectedAt: number;
  /** Whether the Circles-side wallet signature was verified (the 2nd handshake). */
  sigVerified: boolean;
}

/** Transient state carrying one connection attempt across the new-tab OAuth. */
export interface LichessHandoff {
  token: string;
  address: string; // lowercased
  message: string;
  signature: string;
  sigVerified: boolean;
  /** PKCE verifier + redirect, set when the OAuth tab starts. */
  codeVerifier?: string;
  redirectUri?: string;
  status: "pending" | "completed" | "failed";
  username?: string;
  error?: string;
  createdAt: number;
}
