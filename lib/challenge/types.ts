/**
 * Domain types for staked 1v1 Lichess challenges.
 *
 * The stake/escrow/payout layer is deliberately **token-agnostic** (`TokenRef`)
 * so personal-CRC "trophy mode" can slot in later; v1 only ever uses the group
 * token (gCRC). Amounts are stored as **static** (time-invariant) atto-CRC
 * strings — see lib/challenge/accounting.ts for why.
 */
import { SCORE_GROUP_ADDRESS } from "@/lib/circles-config";

export type TokenKind = "group" | "personal";

export interface TokenRef {
  kind: TokenKind;
  /** Group token address (v1) or the avatar whose personal CRC is staked. */
  address: string;
}

export const GROUP_TOKEN: TokenRef = { kind: "group", address: SCORE_GROUP_ADDRESS };

export type ChallengeMode = "personal" | "group";

/**
 * Hub token id a player stakes for a challenge:
 *  - group mode  → the score group's token (fungible, "real money")
 *  - personal    → the player's *own* personal token (a trophy when won)
 */
export function stakeTokenId(mode: ChallengeMode, stakerAddress: string): bigint {
  return mode === "group" ? BigInt(SCORE_GROUP_ADDRESS) : BigInt(stakerAddress);
}

export interface TimeControl {
  key: string;
  label: string;
  /** Initial clock, seconds. */
  limit: number;
  /** Increment per move, seconds. */
  increment: number;
  /** The stake this game costs, in CRC — longer game, higher stake. */
  stake: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { key: "1+0", label: "1 min", limit: 60, increment: 0, stake: 1 }, // bullet
  { key: "3+2", label: "3 + 2", limit: 180, increment: 2, stake: 3 }, // blitz
  { key: "5+3", label: "5 + 3", limit: 300, increment: 3, stake: 5 }, // blitz
  { key: "10+0", label: "10 min", limit: 600, increment: 0, stake: 10 }, // rapid
];

export const timeControlByKey = (k: string): TimeControl | undefined =>
  TIME_CONTROLS.find((t) => t.key === k);

export type ChallengeStatus =
  | "created" // challenger staked, awaiting the opponent's stake
  | "accepted" // both staked, Lichess game created, awaiting result
  | "settled" // winner paid
  | "void" // draw / abort / mismatch → both refunded
  | "expired"; // opponent never accepted → challenger refunded

export interface PlayerRef {
  address: string; // lowercased
  username: string; // connected Lichess username
}

export interface StakeRecord {
  address: string; // lowercased staker
  txHash: string;
  /** Actually-received amount in static atto-CRC (conserved across time). */
  staticAtto: string;
  at: number;
}

export interface LichessGameRef {
  gameId: string;
  urlWhite: string;
  urlBlack: string;
  /** Which player was handed which color. */
  whiteAddress: string;
  blackAddress: string;
}

export interface ChallengeResult {
  /** Raw Lichess status: mate, resign, stalemate, draw, outoftime, aborted… */
  status: string;
  winnerColor?: "white" | "black";
  winnerUsername?: string;
  winnerAddress?: string;
  loserUsername?: string;
  outcome: "win" | "draw" | "void";
  /** Lichess speed category the game was scored in (bullet/blitz/rapid…). */
  category?: string;
  /** Value of the token the winner took = the loser's rating in `category` at
   *  settle time. This is what feeds the score / leaderboard. */
  value?: number;
}

export interface Transfer {
  txHash: string;
  amountAtto: string; // demurraged atto-CRC actually sent
  to: string;
}

export interface Challenge {
  id: string;
  status: ChallengeStatus;
  /** Stake currency. Absent on legacy challenges → treat as "group". */
  mode?: ChallengeMode;
  token: TokenRef;
  timeControl: TimeControl;
  /** Agreed stake per side, static atto-CRC (conserved across time). */
  stakeStaticAtto: string;
  /** The nominal stake the challenger chose, in whole gCRC — for display and
   *  for the opponent to re-stake the matching amount. */
  stakeCrc: number;
  challenger: PlayerRef;
  /** The invited Lichess username (case-insensitive match on accept). The
   *  opponent's wallet is unknown until they accept, so this — not an address —
   *  is who the challenge is for. */
  targetUsername: string;
  /** Filled in when the invite is accepted (who actually showed up). */
  opponent?: PlayerRef;
  stakes: { challenger?: StakeRecord; opponent?: StakeRecord };
  lichess?: LichessGameRef;
  result?: ChallengeResult;
  /** Winner payout(s). Group = one; personal = one per token (each CRC). */
  payouts?: Transfer[];
  refunds?: Transfer[];
  createdAt: number;
  acceptedAt?: number;
  settledAt?: number;
  /** Deadline for the current waiting phase (accept window, or play window). */
  expiresAt: number;
}
