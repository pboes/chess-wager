/**
 * Share-a-challenge links.
 *
 * The actionable link is a **Circles-host deep-link**: the host forwards its
 * `?data=` query param into the miniapp iframe as an `app_data` message, which
 * the SDK surfaces via `onAppData`. We put the challenge id there, so opening the
 * link lands the friend in Stakemate (inside the host, where they can onboard)
 * with the invite already selected.
 */
import type { Challenge } from "@/lib/challenge/types";

/** The miniapp's slug inside the Circles host. */
export const MINIAPP_HOST_URL = "https://circles.gnosis.io/miniapps/stakemate";

/** Deep-link that opens Stakemate in the host focused on a specific challenge. */
export function challengeLink(id: string): string {
  return `${MINIAPP_HOST_URL}?data=${encodeURIComponent(id)}`;
}

/** Ready-to-paste invite a challenger sends their friend (DM, chat, wherever). */
export function challengeBlurb(c: Challenge): string {
  const cur = (c.mode ?? "group") === "personal" ? "points" : "gCRC";
  return (
    `♟ I'm challenging you to a ${c.timeControl.label} game on Stakemate — ` +
    `${c.stakeCrc} ${cur} on the line, winner takes the pot.\n` +
    `Accept here: ${challengeLink(c.id)}`
  );
}
