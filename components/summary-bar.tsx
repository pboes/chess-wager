"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { computeCollection } from "@/lib/challenge/collection";
import type { Challenge } from "@/lib/challenge/types";
import { RefreshCw } from "lucide-react";

const fmt = (n: number) => Math.floor(n).toLocaleString();

/** The standing line: what you can stake, and what you've collected. */
export function SummaryBar({ challenges }: { challenges: Challenge[] }) {
  const { address } = useWallet();
  const { balances, loading, refresh } = useBalances();

  const toPlay = attoToCrc(balances?.heldPersonalAtto) + attoToCrc(balances?.mintableAtto);
  const group = attoToCrc(balances?.heldGroupAtto);
  const hasGroup = Math.floor(group) >= 1;
  const { collected, players } = computeCollection(challenges, address ?? "");

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-5">
          <div>
            <div className="text-lg font-bold tabular-nums">{fmt(toPlay)}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">to play</div>
          </div>
          <div>
            <div className="text-lg font-bold tabular-nums text-[var(--accent)]">
              {fmt(collected)}
            </div>
            <div className="text-[10px] text-[var(--muted-foreground)]">
              collected{players > 0 ? ` · ${players} rival${players === 1 ? "" : "s"}` : ""}
            </div>
          </div>
          {hasGroup && (
            <div>
              <div className="text-lg font-bold tabular-nums">{fmt(group)}</div>
              <div className="text-[10px] text-[var(--muted-foreground)]">group</div>
            </div>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh"
          className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </CardContent>
    </Card>
  );
}
