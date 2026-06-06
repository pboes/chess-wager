"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-provider";

export interface Balances {
  heldPersonalAtto: string;
  heldGroupAtto: string;
  mintableAtto: string;
}

export function useBalances() {
  const { address } = useWallet();
  const [balances, setBalances] = React.useState<Balances | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/balances?address=${address}`, { cache: "no-store" });
      const d = await r.json();
      if (!d.error) setBalances(d);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [address]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balances, loading, refresh };
}

/** Demurraged atto-CRC string → human CRC number. */
export const attoToCrc = (atto?: string): number =>
  atto ? Number(BigInt(atto) / 10n ** 12n) / 1e6 : 0;
