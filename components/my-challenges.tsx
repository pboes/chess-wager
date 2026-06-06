"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import type { Challenge } from "@/lib/challenge/types";
import { Clock, Copy, ExternalLink, Loader2, RefreshCw, Trophy } from "lucide-react";

const STEPS = ["Accept", "Play", "Settle"] as const;

const currencyLabel = (c: Challenge) =>
  (c.mode ?? "group") === "personal" ? "personal CRC" : "gCRC";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return "<1m";
}

/** created → Accept(0), accepted → Play(1), terminal → all done(3). */
function activeStep(status: string): number {
  if (status === "created") return 0;
  if (status === "accepted") return 1;
  return STEPS.length;
}

function Stepper({ active }: { active: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <React.Fragment key={label}>
            <span className="flex items-center gap-1">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                  done
                    ? "bg-[var(--accent)] text-white"
                    : current
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-[10px] ${
                  current
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                {label}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span className={`h-px w-4 ${i < active ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function MyChallenges({ refreshKey }: { refreshKey?: number }) {
  const { address } = useWallet();
  const { stake } = useStake();
  const [challenges, setChallenges] = React.useState<Challenge[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(0);

  // Tick for the expiration countdown (set on mount to avoid SSR mismatch).
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

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

  // Light auto-refresh while anything is in progress — opponent may accept, and
  // the server auto-settles finished games — so the stages advance on their own.
  const hasPending = challenges.some((c) => c.status === "created" || c.status === "accepted");
  React.useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [hasPending, load]);

  const refresh = React.useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([load(), new Promise((r) => setTimeout(r, 450))]);
    setRefreshing(false);
  }, [load, refreshing]);

  const copyLink = React.useCallback(async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked — link is still openable via the button */
    }
  }, []);

  const accept = React.useCallback(
    async (c: Challenge) => {
      setError(null);
      setBusyId(c.id);
      try {
        const hashes = await stake(c.stakeCrc, c.mode ?? "group");
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

  const active = challenges.filter((c) => c.status === "created" || c.status === "accepted");
  const done = challenges.filter((c) => c.status !== "created" && c.status !== "accepted");

  const matchup = (c: Challenge) => {
    const mine = c.challenger.address === me;
    const them = mine ? c.opponent : c.challenger;
    return { mine, them };
  };

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

        {/* Active challenges — guided through the stages. */}
        {active.map((c) => {
          const { mine, them } = matchup(c);
          const busy = busyId === c.id;
          const myUrl =
            c.lichess && (c.lichess.whiteAddress === me ? c.lichess.urlWhite : c.lichess.urlBlack);

          return (
            <div key={c.id} className="space-y-2.5 rounded-xl border border-[var(--border)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold">{c.timeControl.label}</span>
                  <span className="text-[var(--muted-foreground)]">
                    {" · "}
                    {c.stakeCrc} {currencyLabel(c)} {mine ? "vs" : "from"} {them.username}
                  </span>
                </div>
              </div>

              <Stepper active={activeStep(c.status)} />

              {c.status === "created" && now > 0 && (
                <p className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                  <Clock className="h-3 w-3" />
                  {c.expiresAt - now > 0
                    ? `Expires in ${formatRemaining(c.expiresAt - now)}`
                    : "Expired — reclaim available"}
                </p>
              )}

              {/* Stage 1 — opponent accepts. */}
              {c.status === "created" && !mine && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {them.username} challenged you. Accept to stake {c.stakeCrc} {currencyLabel(c)} and start.
                  </p>
                  <Button size="sm" className="w-full" disabled={busy} onClick={() => accept(c)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Accept · stake ${c.stakeCrc} ${currencyLabel(c)}`}
                  </Button>
                </div>
              )}
              {c.status === "created" && mine && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Waiting for {them.username} to accept and stake — they’ll see it in their
                    challenges.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => settle(c)}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reclaim stake if expired"}
                  </Button>
                </div>
              )}

              {/* Stage 2 → 3 — play elsewhere, come back to settle. */}
              {c.status === "accepted" && (
                <div className="space-y-2">
                  <div className="space-y-2 rounded-lg bg-[var(--secondary)]/40 p-2.5">
                    <p className="text-xs">
                      <span className="font-semibold">Play</span> the game on Lichess (new tab),
                      then come back here.
                    </p>
                    {myUrl && (
                      <div className="flex flex-wrap gap-2">
                        <a href={myUrl} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-4 w-4" /> Open on Lichess
                          </Button>
                        </a>
                        <Button size="sm" variant="outline" onClick={() => copyLink(c.id, myUrl)}>
                          <Copy className="h-4 w-4" /> {copiedId === c.id ? "Copied" : "Copy link"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button size="sm" className="w-full" disabled={busy} onClick={() => settle(c)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "I’ve played → Settle"}
                  </Button>
                  <p className="text-[10px] text-[var(--muted-foreground)]">
                    Finished games settle automatically too — this just does it now.
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {/* History — compact one-liners. */}
        {done.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {active.length > 0 && (
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                History
              </p>
            )}
            {done.map((c) => {
              const { mine, them } = matchup(c);
              const won = c.status === "settled" && c.result?.winnerAddress?.toLowerCase() === me;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <span className="truncate">
                    <span className="font-medium">{c.timeControl.label}</span>
                    <span className="text-[var(--muted-foreground)]">
                      {" · "}
                      {c.stakeCrc} {currencyLabel(c)} {mine ? "vs" : "from"} {them.username}
                    </span>
                  </span>
                  {c.status === "settled" ? (
                    won ? (
                      <Badge variant="success">Won 🏆</Badge>
                    ) : (
                      <Badge variant="muted">{c.result?.winnerUsername ?? "Lost"} won</Badge>
                    )
                  ) : (
                    <Badge variant="muted">{c.status === "void" ? "Refunded" : "Expired"}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
