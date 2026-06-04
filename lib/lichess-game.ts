/**
 * Lichess as the game oracle — token-free **open challenges**.
 *
 * On acceptance we create the exact game (fixed gameId + two color URLs); at
 * settle we read the authoritative result by that gameId. Because the app owns
 * the gameId and (optionally) restricts it to the two usernames, players can't
 * cherry-pick a favorable game or sub in a ringer.
 */
import { LICHESS_HOST } from "./lichess";
import type { TimeControl } from "./challenge/types";

export interface OpenChallenge {
  gameId: string;
  urlWhite: string;
  urlBlack: string;
}

/**
 * Create an open challenge for the given time control. If `users` (a pair of
 * Lichess usernames) is supplied, only those accounts may join.
 */
export async function createOpenChallenge(
  tc: TimeControl,
  users?: [string, string]
): Promise<OpenChallenge> {
  const body = new URLSearchParams();
  body.set("clock.limit", String(tc.limit));
  body.set("clock.increment", String(tc.increment));
  body.set("rated", "false");
  body.set("variant", "standard");
  if (users) body.set("users", users.join(","));

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  // Optional app token only raises rate limits — it is not a per-user credential.
  if (process.env.LICHESS_API_TOKEN)
    headers.authorization = `Bearer ${process.env.LICHESS_API_TOKEN}`;

  const res = await fetch(`${LICHESS_HOST}/api/challenge/open`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new Error(`Lichess open challenge failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const gameId: string | undefined = data.id ?? data.challenge?.id;
  if (!gameId) throw new Error("Lichess open challenge returned no game id");
  return { gameId, urlWhite: data.urlWhite, urlBlack: data.urlBlack };
}

export interface GameResult {
  /** True once the game has a final state (not created/started). */
  finished: boolean;
  status: string; // mate, resign, stalemate, draw, outoftime, aborted, noStart…
  winner?: "white" | "black"; // absent on a draw
  white?: string; // username (absent for anonymous — shouldn't happen here)
  black?: string;
  clock?: { limit: number; increment: number };
}

/** Read the authoritative result of a game by id. */
export async function fetchGameResult(gameId: string): Promise<GameResult> {
  const res = await fetch(
    `${LICHESS_HOST}/game/export/${gameId}?clocks=false&evals=false&moves=false`,
    { headers: { accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`Lichess game export failed: ${res.status}`);
  const g = await res.json();
  const live = g.status === "created" || g.status === "started";
  return {
    finished: Boolean(g.status) && !live,
    status: g.status,
    winner: g.winner,
    white: g.players?.white?.user?.name,
    black: g.players?.black?.user?.name,
    clock: g.clock
      ? { limit: g.clock.initial, increment: g.clock.increment }
      : undefined,
  };
}
