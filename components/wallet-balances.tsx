"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { buildClaimTxs } from "@/lib/claim";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

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

/** Compact balance strip + Claim, so a player sees what they can stake. */
export function WalletBalances() {
  const { address, sendTransactions } = useWallet();
  const { balances, loading, refresh } = useBalances();
  const [claiming, setClaiming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const personal = attoToCrc(balances?.heldPersonalAtto);
  const mintable = attoToCrc(balances?.mintableAtto);
  const group = attoToCrc(balances?.heldGroupAtto);
  const canClaim = Math.floor(mintable) >= 1;

  const claim = React.useCallback(async () => {
    if (!address || !balances) return;
    setError(null);
    setClaiming(true);
    try {
      const txs = buildClaimTxs(address as `0x${string}`, BigInt(balances.mintableAtto));
      await sendTransactions(txs);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t claim — please try again.");
    } finally {
      setClaiming(false);
    }
  }, [address, balances, sendTransactions, refresh]);

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
        {canClaim && (
          <Button size="sm" variant="outline" className="w-full" disabled={claiming} onClick={claim}>
            {claiming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Claiming…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Claim {fmt(mintable)} personal CRC
              </>
            )}
          </Button>
        )}
        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
