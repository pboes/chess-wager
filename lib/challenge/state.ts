/**
 * Challenge state machine: phase deadlines and transition guards.
 *
 *   created  → opponent stakes  → accepted   (or accept-window lapses → expired)
 *   accepted → game settled     → settled    (or play-window lapses   → void)
 */
import type { Challenge, ChallengeStatus } from "./types";

export const ACCEPT_WINDOW_MS = 24 * 60 * 60 * 1000; // opponent must stake within 24h
export const PLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // game must finish within 24h of accept

export const isTerminal = (s: ChallengeStatus): boolean =>
  s === "settled" || s === "void" || s === "expired";

/** Has the current waiting phase's deadline passed? */
export const isExpired = (c: Challenge, now: number): boolean =>
  !isTerminal(c.status) && now > c.expiresAt;

/** A `created` challenge whose accept window lapsed → refund the challenger. */
export const shouldExpire = (c: Challenge, now: number): boolean =>
  c.status === "created" && now > c.expiresAt;

/** An `accepted` challenge whose play window lapsed → void & refund both. */
export const shouldVoidUnplayed = (c: Challenge, now: number): boolean =>
  c.status === "accepted" && now > c.expiresAt;
