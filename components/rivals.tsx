"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { computeCollection } from "@/lib/challenge/collection";
import type { Challenge } from "@/lib/challenge/types";
import { Trophy } from "lucide-react";

/** A compact head-to-head record as filled/empty pips (capped for layout). */
function Record({ wins, losses }: { wins: number; losses: number }) {
  const pips: React.ReactNode[] = [];
  const cap = 6;
  for (let i = 0; i < Math.min(wins, cap); i++)
    pips.push(<span key={`w${i}`} className="h-2 w-2 rounded-full bg-[var(--accent)]" />);
  for (let i = 0; i < Math.min(losses, cap - Math.min(wins, cap)); i++)
    pips.push(<span key={`l${i}`} className="h-2 w-2 rounded-full bg-[var(--border)]" />);
  return <span className="flex items-center gap-1">{pips}</span>;
}

function lead(wins: number, losses: number): string {
  if (wins > losses) return `you lead ${wins}–${losses}`;
  if (losses > wins) return `down ${wins}–${losses}`;
  return `even ${wins}–${losses}`;
}

/**
 * The collection — who you've taken coins from, with head-to-head records. This
 * is the heart of the game: winning isn't a number going up, it's another
 * player's coins in your cabinet.
 */
export function Rivals({ challenges }: { challenges: Challenge[] }) {
  const { address } = useWallet();
  const { collected, players, rivals } = React.useMemo(
    () => computeCollection(challenges, address ?? ""),
    [challenges, address]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[var(--primary)]" />
            Rivals & trophies
          </span>
          {collected > 0 && (
            <span className="text-xs font-normal text-[var(--muted-foreground)]">
              {collected} from {players} player{players === 1 ? "" : "s"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rivals.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No trophies yet. Win a game and you’ll collect your rival’s coins — they show up
            here.
          </p>
        ) : (
          rivals.map((r) => {
            const crown = r.wins >= 3 && r.losses === 0;
            return (
              <div
                key={r.username}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{r.username}</span>
                    {crown && <span title="Clean sweep">👑</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                    <Record wins={r.wins} losses={r.losses} />
                    <span>{lead(r.wins, r.losses)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold tabular-nums text-[var(--accent)]">
                    {r.collected > 0 ? `+${r.collected}` : "—"}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">
                    {r.collected > 0 ? "of their coins" : r.lost > 0 ? `${r.lost} to them` : ""}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
