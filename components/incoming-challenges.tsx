"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import { Crowns } from "@/components/ui/crown";
import type { Challenge } from "@/lib/challenge/types";
import { Loader2, Swords } from "lucide-react";

/** Stake amount with its currency symbol: Crowns glyph (personal) or gCRC. */
const amt = (c: Challenge) =>
  (c.mode ?? "group") === "personal" ? <Crowns value={c.stakeCrc} /> : <>{c.stakeCrc} gCRC</>;

/**
 * Incoming challenges to accept — the loud, top-of-page call to action. Sourced
 * from invites addressed to the player's Lichess username, which the server
 * merges into the challenge feed; so they appear the moment the player opens
 * Stakemate, no share-link needed.
 */
export function IncomingChallenges({
  challenges,
  onChange,
}: {
  challenges: Challenge[];
  onChange: () => void;
}) {
  const { address } = useWallet();
  const { stake } = useStake();
  const me = address?.toLowerCase() ?? "";
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Invites addressed to me and still open (challenger ≠ me). They reach my feed
  // because the challenge is indexed by my Lichess username server-side.
  const incoming = challenges.filter(
    (c) => c.status === "created" && c.challenger.address !== me
  );

  const accept = React.useCallback(
    async (c: Challenge) => {
      if (!address) return;
      setError(null);
      setBusyId(c.id);
      try {
        const hashes = await stake(c.stakeCrc, c.mode ?? "group");
        let lastErr = "Couldn’t accept.";
        for (const txHash of hashes) {
          const res = await fetch(`/api/challenge/${c.id}/accept`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ opponentAddress: address, txHash }),
          });
          const d = await res.json();
          if (res.ok && d.challenge) {
            onChange();
            return;
          }
          lastErr = d.error ?? lastErr;
        }
        setError(lastErr);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [address, stake, onChange]
  );

  if (incoming.length === 0) return null;

  return (
    <div className="space-y-2">
      {incoming.map((c) => {
        const busy = busyId === c.id;
        return (
          <Card key={c.id} className="border-[var(--primary)] bg-[var(--primary)]/5">
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-center gap-2">
                <Swords className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                <p className="text-sm">
                  <span className="font-semibold">{c.challenger.username}</span> challenged you —{" "}
                  <span className="font-semibold">{c.timeControl.label}</span> for{" "}
                  <span className="font-semibold">{amt(c)}</span>. Winner takes the Crowns.
                </p>
              </div>
              <Button className="w-full" disabled={busy} onClick={() => accept(c)}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Accept · stake {amt(c)}</>
                )}
              </Button>
              {error && busyId === null && (
                <p className="text-xs text-[var(--destructive)]">{error}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
