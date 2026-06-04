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

export interface TimeControl {
  key: string;
  label: string;
  /** Initial clock, seconds. */
  limit: number;
  /** Increment per move, seconds. */
  increment: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { key: "10+0", label: "10 min", limit: 600, increment: 0 },
  { key: "5+3", label: "5 + 3", limit: 300, increment: 3 },
  { key: "3+2", label: "3 + 2", limit: 180, increment: 2 },
  { key: "5+0", label: "5 min", limit: 300, increment: 0 },
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
  outcome: "win" | "draw" | "void";
}

export interface Transfer {
  txHash: string;
  amountAtto: string; // demurraged atto-CRC actually sent
  to: string;
}

export interface Challenge {
  id: string;
  status: ChallengeStatus;
  token: TokenRef;
  timeControl: TimeControl;
  /** Agreed stake per side, static atto-CRC (conserved across time). */
  stakeStaticAtto: string;
  /** The nominal stake the challenger chose, in whole gCRC — for display and
   *  for the opponent to re-stake the matching amount. */
  stakeCrc: number;
  challenger: PlayerRef;
  opponent: PlayerRef;
  stakes: { challenger?: StakeRecord; opponent?: StakeRecord };
  lichess?: LichessGameRef;
  result?: ChallengeResult;
  payout?: Transfer;
  refunds?: Transfer[];
  createdAt: number;
  acceptedAt?: number;
  settledAt?: number;
  /** Deadline for the current waiting phase (accept window, or play window). */
  expiresAt: number;
}
