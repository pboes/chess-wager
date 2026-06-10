"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import type { Challenge } from "@/lib/challenge/types";
import { Loader2, Swords } from "lucide-react";

const currency = (c: Challenge) => ((c.mode ?? "group") === "personal" ? "Crowns" : "gCRC");

/**
 * Incoming challenges to accept — the loud, top-of-page call to action. Sources:
 *  - invites addressed to the player's Lichess username (server merges them into
 *    the challenge feed), and
 *  - a specific challenge from a share link (`appData` = challenge id), fetched
 *    directly if it isn't in the feed yet.
 */
export function IncomingChallenges({
  challenges,
  onChange,
}: {
  challenges: Challenge[];
  onChange: () => void;
}) {
  const { address, appData, clearAppData } = useWallet();
  const { stake } = useStake();
  const me = address?.toLowerCase() ?? "";
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [linked, setLinked] = React.useState<Challenge | null>(null);

  // Invites addressed to me and still open (challenger ≠ me).
  const incoming = challenges.filter(
    (c) => c.status === "created" && c.challenger.address !== me
  );

  // Resolve a share-link challenge id that isn't already in the feed.
  React.useEffect(() => {
    if (!appData) {
      setLinked(null);
      return;
    }
    if (challenges.some((c) => c.id === appData)) {
      setLinked(null); // already shown via the feed
      return;
    }
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/challenge/${appData}`);
        const d = await r.json();
        if (!off && r.ok && d.challenge) setLinked(d.challenge);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      off = true;
    };
  }, [appData, challenges]);

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
            clearAppData();
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
    [address, stake, onChange, clearAppData]
  );

  // The linked challenge, only if it's a fresh open invite not already in the feed.
  const linkedOpen =
    linked && linked.status === "created" && linked.challenger.address !== me ? linked : null;
  const all = linkedOpen ? [linkedOpen, ...incoming] : incoming;
  if (all.length === 0) return null;

  return (
    <div className="space-y-2">
      {all.map((c) => {
        const busy = busyId === c.id;
        return (
          <Card key={c.id} className="border-[var(--primary)] bg-[var(--primary)]/5">
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-center gap-2">
                <Swords className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                <p className="text-sm">
                  <span className="font-semibold">{c.challenger.username}</span> challenged you —{" "}
                  <span className="font-semibold">{c.timeControl.label}</span> for{" "}
                  <span className="font-semibold">
                    {c.stakeCrc} {currency(c)}
                  </span>
                  . Winner takes the coins.
                </p>
              </div>
              <Button className="w-full" disabled={busy} onClick={() => accept(c)}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Accept · stake ${c.stakeCrc} ${currency(c)}`
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
