"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import type { Challenge } from "@/lib/challenge/types";
import { ExternalLink, Loader2, RefreshCw, Trophy } from "lucide-react";

const statusBadge: Record<string, { label: string; variant: "success" | "muted" | "default" }> = {
  created: { label: "Awaiting opponent", variant: "muted" },
  accepted: { label: "Game on", variant: "default" },
  settled: { label: "Settled", variant: "success" },
  void: { label: "Refunded", variant: "muted" },
  expired: { label: "Expired", variant: "muted" },
};

export function MyChallenges({ refreshKey }: { refreshKey?: number }) {
  const { address } = useWallet();
  const { stake } = useStake();
  const [challenges, setChallenges] = React.useState<Challenge[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const me = address?.toLowerCase() ?? "";

  const load = React.useCallback(async () => {
    if (!address) return;
    try {
      const r = await fetch(`/api/challenges?address=${address}`, { cache: "no-store" });
      const d = await r.json();
      setChallenges(d.challenges ?? []);
    } catch {
      /* ignore */
    }
  }, [address]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Manual refresh with a guaranteed-visible spin so the button feels alive.
  const refresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([load(), new Promise((r) => setTimeout(r, 450))]);
    setRefreshing(false);
  }, [load, refreshing]);

  const accept = React.useCallback(
    async (c: Challenge) => {
      setError(null);
      setBusyId(c.id);
      try {
        const hashes = await stake(c.stakeCrc);
        let lastErr = "Couldn't accept.";
        for (const txHash of hashes) {
          const res = await fetch(`/api/challenge/${c.id}/accept`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ opponentAddress: address, txHash }),
          });
          const d = await res.json();
          if (res.ok && d.challenge) {
            await load();
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
    [address, stake, load]
  );

  const settle = React.useCallback(
    async (c: Challenge) => {
      setError(null);
      setBusyId(c.id);
      try {
        const res = await fetch(`/api/challenge/${c.id}/settle`, { method: "POST" });
        const d = await res.json();
        if (!res.ok) setError(d.error ?? "Not ready to settle yet.");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  if (!address) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[var(--primary)]" />
          My challenges
        </CardTitle>
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh"
          className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {challenges.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">
            No challenges yet. Create one above.
          </p>
        )}
        {challenges.map((c) => {
          const mine = c.challenger.address === me;
          const them = mine ? c.opponent : c.challenger;
          const sb = statusBadge[c.status] ?? statusBadge.created;
          const myUrl =
            c.lichess && (c.lichess.whiteAddress === me ? c.lichess.urlWhite : c.lichess.urlBlack);
          const incoming = c.status === "created" && !mine;
          const won = c.status === "settled" && c.result?.winnerAddress?.toLowerCase() === me;

          return (
            <div key={c.id} className="rounded-xl border border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-semibold">{c.timeControl.label}</span>
                  <span className="text-[var(--muted-foreground)]">
                    {" · "}
                    {c.stakeCrc} gCRC {mine ? "vs" : "from"} {them.username}
                  </span>
                </div>
                <Badge variant={sb.variant}>{sb.label}</Badge>
              </div>

              {c.status === "settled" && (
                <p className="mt-1 text-xs">
                  {won ? (
                    <span className="font-semibold text-[var(--accent)]">
                      You won the pot 🏆
                    </span>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">
                      Won by {c.result?.winnerUsername ?? "—"} ({c.result?.status})
                    </span>
                  )}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                {incoming && (
                  <Button size="sm" disabled={busyId === c.id} onClick={() => accept(c)}>
                    {busyId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Accept · stake ${c.stakeCrc}`
                    )}
                  </Button>
                )}
                {c.status === "accepted" && myUrl && (
                  <a href={myUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-4 w-4" /> Open on Lichess
                    </Button>
                  </a>
                )}
                {c.status === "accepted" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => settle(c)}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Game played → settle"
                    )}
                  </Button>
                )}
                {c.status === "created" && mine && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => settle(c)}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Reclaim if expired"
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
