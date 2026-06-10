/**
 * Share-a-challenge invite.
 *
 * No per-challenge deep-link: a challenge is indexed by the opponent's Lichess
 * username, so it surfaces on their home screen the moment they open Stakemate
 * (and connect that account). The invite is just a friendly message — addressed
 * to the opponent — pointing at the app.
 */
import type { Challenge } from "@/lib/challenge/types";

/** The miniapp's URL inside the Circles host. */
export const MINIAPP_HOST_URL = "https://circles.gnosis.io/miniapps/stakemate";

/** Ready-to-paste invite a challenger sends their opponent (DM, chat, wherever). */
export function challengeBlurb(c: Challenge): string {
  return (
    `♟ @${c.targetUsername} — I've set up a Lichess challenge for you on Stakemate: ` +
    `${c.timeControl.label}, ${c.stakeCrc} Crowns on the line, winner takes the pot.\n` +
    `Open ${MINIAPP_HOST_URL} to accept and match my stake!`
  );
}
