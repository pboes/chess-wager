"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/components/wallet/wallet-provider";
import { opponentName } from "@/lib/challenge/collection";
import type { Challenge } from "@/lib/challenge/types";
import { Clock, Copy, ExternalLink, Loader2, Swords } from "lucide-react";

const STEPS = ["Accepted", "Play", "Settle"] as const;

const currencyLabel = (c: Challenge) =>
  (c.mode ?? "group") === "personal" ? "CRC" : "gCRC";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 1) return `${h}h ${m}m`;
  if (m >= 1) return `${m}m`;
  return "<1m";
}

/** accepted → Play(1); terminal → done. (created-mine handled separately below.) */
function activeStep(status: string): number {
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

/**
 * The player's live games: challenges they sent that are awaiting acceptance,
 * accepted games to play & settle, and a collapsed history. Incoming invites to
 * accept live in <IncomingChallenges>.
 */
export function ActiveGames({
  challenges,
  onChange,
}: {
  challenges: Challenge[];
  onChange: () => void;
}) {
  const { address } = useWallet();
  const me = address?.toLowerCase() ?? "";
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const copyLink = React.useCallback(async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  }, []);

  const settle = React.useCallback(
    async (c: Challenge) => {
      setError(null);
      setBusyId(c.id);
      try {
        const res = await fetch(`/api/challenge/${c.id}/settle`, { method: "POST" });
        const d = await res.json();
        if (!res.ok) setError(d.error ?? "Not ready to settle yet.");
        onChange();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [onChange]
  );

  if (!address) return null;

  // My sent-and-waiting + any accepted game (either side). Incoming `created`
  // invites (challenger ≠ me) are shown by <IncomingChallenges>.
  const waiting = challenges.filter(
    (c) => c.status === "created" && c.challenger.address === me
  );
  const live = challenges.filter((c) => c.status === "accepted");
  const done = challenges.filter(
    (c) => c.status === "settled" || c.status === "void" || c.status === "expired"
  );

  if (waiting.length === 0 && live.length === 0 && done.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--primary)]" />
          Your games
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sent, awaiting acceptance */}
        {waiting.map((c) => {
          const them = opponentName(c, me);
          const busy = busyId === c.id;
          const expired = now > 0 && now > c.expiresAt;
          return (
            <div key={c.id} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
              <div className="text-sm">
                <span className="font-semibold">{c.timeControl.label}</span>
                <span className="text-[var(--muted-foreground)]">
                  {" · "}
                  {c.stakeCrc} {currencyLabel(c)} vs {them}
                </span>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <Clock className="h-3 w-3" />
                {expired
                  ? "Expired — reclaim your stake"
                  : `Waiting for ${them} to accept · ${formatRemaining(c.expiresAt - now)} left`}
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => settle(c)}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : expired ? (
                  "Reclaim stake"
                ) : (
                  "Reclaim if expired"
                )}
              </Button>
            </div>
          );
        })}

        {/* Accepted — play on Lichess, then settle */}
        {live.map((c) => {
          const them = opponentName(c, me);
          const busy = busyId === c.id;
          const myUrl =
            c.lichess && (c.lichess.whiteAddress === me ? c.lichess.urlWhite : c.lichess.urlBlack);
          return (
            <div key={c.id} className="space-y-2.5 rounded-xl border border-[var(--border)] p-3">
              <div className="text-sm">
                <span className="font-semibold">{c.timeControl.label}</span>
                <span className="text-[var(--muted-foreground)]">
                  {" · "}
                  {c.stakeCrc} {currencyLabel(c)} vs {them}
                </span>
              </div>
              <Stepper active={activeStep(c.status)} />
              <div className="space-y-2 rounded-lg bg-[var(--secondary)]/40 p-2.5">
                <p className="text-xs">
                  <span className="font-semibold">Play</span> the game on Lichess (new tab), then
                  come back.
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
          );
        })}

        {/* History */}
        {done.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {(waiting.length > 0 || live.length > 0) && (
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                History
              </p>
            )}
            {done.map((c) => {
              const them = opponentName(c, me);
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
                      {c.stakeCrc} {currencyLabel(c)} vs {them}
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
