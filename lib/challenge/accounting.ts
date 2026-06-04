/**
 * Stake/payout accounting under Circles demurrage.
 *
 * Validated by scripts/demurrage-spike (in the puzzle repo): if we denominate
 * every stake in **static** (time-invariant) atto-CRC, then the pooled escrow's
 * decayed balance and `toDemurrageNow(Σ static)` agree to within **1 wei**
 * across 0.001–1000 CRC and instant–30-day windows. So a tiny dust float makes
 * an over-draw impossible. Demurrage itself is not a rounding bug — it's
 * day-quantized economic decay (0% for minutes, ~0.04%/day), borne uniformly,
 * so the winner simply takes the actual current pot.
 */
import { CirclesConverter } from "@aboutcircles/sdk-utils/circlesConverter";

/** 1e-6 CRC — dwarfs the ≤1 wei residual, so payouts never exceed the balance. */
export const DUST_FLOAT_ATTO = 10n ** 12n;

/** Demurraged "today" atto-CRC → static atto-CRC (store this). */
export const toStatic = (demurragedAtto: bigint): bigint =>
  CirclesConverter.attoCirclesToAttoStaticCircles(demurragedAtto);

/** Static atto-CRC → demurraged atto-CRC at the current instant. */
export const toDemurrageNow = (staticAtto: bigint): bigint =>
  CirclesConverter.attoStaticCirclesToAttoCircles(staticAtto);

/** Whole gCRC → demurraged atto-CRC (1e18), via 1e6 to avoid fp drift. */
export const crcToAtto = (crc: number): bigint =>
  BigInt(Math.round(crc * 1e6)) * 10n ** 12n;

/**
 * The winner's payout: the current demurraged value of the pooled static
 * stakes, minus the dust float so the ERC1155 transfer can never over-draw.
 */
export function computePayoutAtto(...staticAttos: bigint[]): bigint {
  const sum = staticAttos.reduce((a, b) => a + b, 0n);
  const gross = toDemurrageNow(sum);
  return gross > DUST_FLOAT_ATTO ? gross - DUST_FLOAT_ATTO : gross;
}
