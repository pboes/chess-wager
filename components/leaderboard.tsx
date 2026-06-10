"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useWallet } from "@/components/wallet/wallet-provider";
import { computeCollection } from "@/lib/challenge/collection";
import type { Challenge } from "@/lib/challenge/types";
import { HelpCircle, Loader2, Trophy } from "lucide-react";

type View = "global" | "friends" | "you";

interface Row {
  username: string;
  score: number;
  rank: number;
  isMe: boolean;
}

const VIEWS: { key: View; label: string }[] = [
  { key: "global", label: "Global" },
  { key: "friends", label: "Friends" },
  { key: "you", label: "You" },
];

const fmt = (n: number) => Math.round(n).toLocaleString();

export function Leaderboard({ challenges }: { challenges: Challenge[] }) {
  const { address } = useWallet();
  const [view, setView] = React.useState<View>("global");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);

  React.useEffect(() => {
    if (view === "you" || !address) return;
    let off = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/leaderboard?address=${address}&scope=${view}`);
        const d = await r.json();
        if (!off) setRows(Array.isArray(d.rows) ? d.rows : []);
      } catch {
        if (!off) setRows([]);
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [view, address, challenges]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[var(--primary)]" />
            Leaderboard
          </span>
          <button
            onClick={() => setShowHelp(true)}
            aria-label="How scoring works"
            className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex-1 rounded-md py-1.5 font-medium transition ${
                view === v.key
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <Modal open={showHelp} onClose={() => setShowHelp(false)} title="How scoring works">
          <p>
            Your <strong className="text-[var(--foreground)]">score</strong> is the combined value
            of every opponent you’ve beaten.
          </p>
          <p>
            A win is worth that player’s{" "}
            <strong className="text-[var(--foreground)]">Lichess rating</strong> in the game’s
            category (bullet, blitz or rapid) at the time you played. Beat a 2000 → +2000; beat a
            1200 → +1200. Beating stronger players is worth more.
          </p>
          <p>
            <strong className="text-[var(--foreground)]">Global</strong> ranks everyone.{" "}
            <strong className="text-[var(--foreground)]">Friends</strong> ranks you and the players
            you follow on Lichess. <strong className="text-[var(--foreground)]">You</strong> breaks
            down the points you’ve taken, rival by rival.
          </p>
        </Modal>

        {view === "you" ? (
          <YouView challenges={challenges} />
        ) : loading ? (
          <div className="flex justify-center py-8 text-[var(--muted-foreground)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.filter((r) => r.score > 0).length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
            {view === "friends"
              ? "No scores among your friends yet. Beat one of them to get on the board."
              : "No scores yet — be the first to win a game."}
          </p>
        ) : (
          <div className="space-y-1">
            {rows
              .filter((r) => r.score > 0 || r.isMe)
              .map((r) => (
                <div
                  key={r.username}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    r.isMe
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-[var(--border)]"
                  }`}
                >
                  <span className="w-6 shrink-0 text-center font-bold tabular-nums text-[var(--muted-foreground)]">
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.username}
                    {r.isMe && <span className="text-[var(--muted-foreground)]"> · you</span>}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-[var(--accent)]">
                    {fmt(r.score)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Your personal breakdown: total score + points taken from each rival. */
function YouView({ challenges }: { challenges: Challenge[] }) {
  const { address } = useWallet();
  const { collected, rivals } = React.useMemo(
    () => computeCollection(challenges, address ?? ""),
    [challenges, address]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-[var(--secondary)]/40 py-3 text-center">
        <div className="font-display text-2xl font-bold tabular-nums text-[var(--accent)]">
          {fmt(collected)}
        </div>
        <div className="text-[11px] text-[var(--muted-foreground)]">your score — won off rivals</div>
      </div>
      {rivals.length === 0 ? (
        <p className="py-2 text-center text-sm text-[var(--muted-foreground)]">
          Win a game and the points you take show up here, rival by rival.
        </p>
      ) : (
        <div className="space-y-1">
          {rivals.map((r) => (
            <div
              key={r.username}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.username}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {r.wins}–{r.losses}
                  {r.lost > 0 && ` · ${fmt(r.lost)} to them`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold tabular-nums text-[var(--accent)]">
                  {r.collected > 0 ? `+${fmt(r.collected)}` : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
