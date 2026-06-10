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
/**
 * `follow:read` lets us read who the player follows (their "friends") at connect
 * time, so we can offer them as challenge targets. We use the token once, server-
 * side, then revoke it — nothing is stored but the resulting usernames.
 */
export const LICHESS_SCOPES: string[] = ["follow:read"];

/**
 * Read the accounts a user follows via `GET /api/rel/following` (NDJSON stream of
 * user objects). Best-effort: returns [] on any failure. Caller holds the token.
 */
export async function fetchFollowing(accessToken: string): Promise<string[]> {
  try {
    const res = await fetch(`${LICHESS_HOST}/api/rel/following`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/x-ndjson" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const names: string[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const u = JSON.parse(t);
        if (typeof u?.username === "string") names.push(u.username);
      } catch {
        /* skip malformed line */
      }
    }
    return names;
  } catch {
    return [];
  }
}

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

/**
 * Lichess speed category for a clock, by estimated game duration
 * (`limit + 40·increment` seconds) — the same bucketing Lichess uses. Determines
 * which rating a won token is valued by.
 */
export function speedCategory(limitSec: number, incrementSec: number): string {
  const est = limitSec + 40 * incrementSec;
  if (est < 30) return "ultraBullet";
  if (est < 180) return "bullet";
  if (est < 480) return "blitz";
  if (est < 1500) return "rapid";
  return "classical";
}

/**
 * A player's Lichess rating in a category (their perf rating). Used to value a
 * token at the moment it's won. Falls back to 1500 (Lichess's default) if the
 * player is unrated there or the lookup fails — a win should always score.
 */
export async function fetchRating(username: string, category: string): Promise<number> {
  try {
    const res = await fetch(`${LICHESS_HOST}/api/user/${encodeURIComponent(username)}`);
    if (!res.ok) return 1500;
    const u = await res.json();
    const rating = u?.perfs?.[category]?.rating;
    return typeof rating === "number" && rating > 0 ? rating : 1500;
  } catch {
    return 1500;
  }
}

/** Public check that a Lichess username exists. Lenient: returns true on a
 *  network error so a transient outage can't block challenge creation. */
export async function lichessUserExists(username: string): Promise<boolean> {
  try {
    const res = await fetch(`${LICHESS_HOST}/api/user/${encodeURIComponent(username)}`);
    if (res.status === 404) return false;
    if (!res.ok) return true; // rate-limited / transient → don't block
    const u = await res.json();
    return !u?.closed && !u?.disabled;
  } catch {
    return true;
  }
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
  /** Lichess usernames this player follows ("friends"), captured at connect time. */
  following?: string[];
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
