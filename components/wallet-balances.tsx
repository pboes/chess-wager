"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { RefreshCw } from "lucide-react";

// Floor, never round up — match the Circles app and never over-state a balance.
const fmt = (n: number) => Math.floor(n).toLocaleString();

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-[var(--secondary)]/40 px-2 py-2 text-center">
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-[var(--muted-foreground)]">{label}</div>
      {hint && <div className="text-[9px] text-[var(--muted-foreground)]">{hint}</div>}
    </div>
  );
}

/** Compact balance strip so a player can see what they can stake. */
export function WalletBalances() {
  const { balances, loading, refresh } = useBalances();
  const personal = attoToCrc(balances?.heldPersonalAtto);
  const mintable = attoToCrc(balances?.mintableAtto);
  const group = attoToCrc(balances?.heldGroupAtto);

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Your CRC
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh balances"
            className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Personal" value={fmt(personal)} hint="play money" />
          <Stat label="Claimable" value={`+${fmt(mintable)}`} hint="1 / hour" />
          <Stat label="Group" value={fmt(group)} hint="real money" />
        </div>
      </CardContent>
    </Card>
  );
}
